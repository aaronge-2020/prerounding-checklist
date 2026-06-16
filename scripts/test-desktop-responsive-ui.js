import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const vaultMetaKey = "prerounding-local-vault-meta-v2";
const vaultDataKey = "prerounding-local-vault-data-v1";
const publicCatalogCacheKey = "prerounding-public-workup-catalog-cache-v1";

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

function decodeLocalBundle(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function encodeLocalBundle(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function clickPatientTab(page, tabName) {
  const selector = `[data-patient-tab="${tabName}"]`;
  const tab = page.locator(selector).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  } else {
    await page.evaluate((targetSelector) => document.querySelector(targetSelector)?.click(), selector);
  }
  await page.waitForFunction((expectedTab) => document.body.dataset.patientTab === expectedTab, tabName);
}

async function showPatientWorkupsPane(page) {
  await page.evaluate(() => document.querySelector('#patientWorkupPanel .target-pane-switcher [data-workup-pane-target="workups"]')?.click());
  await page.waitForFunction(() => {
    const panel = document.querySelector("#patientWorkupPanel");
    const input = document.querySelector("#patientWorkupConcernInput");
    return panel?.dataset.activePane === "workups" && Boolean(input?.getBoundingClientRect().height);
  });
}

async function showPatientPathwayPane(page) {
  await page.evaluate(() => document.querySelector('#patientWorkupPanel .target-pane-switcher [data-workup-pane-target="pathway"]')?.click());
  await page.waitForFunction(() => {
    const panel = document.querySelector("#patientWorkupPanel");
    const toggle = document.querySelector("#decisionTreeHighlightPathToggle");
    return panel?.dataset.activePane === "pathway" && Boolean(toggle?.getBoundingClientRect().height);
  });
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

function publicCatalogCacheFixture() {
  return JSON.stringify({
    schema: "public_workup_catalog_cache_v1",
    cachedAt: "2026-06-15T05:00:00.000Z",
    workups: [{
      id: "public_cache_smoke_workup_v1",
      title: "Public cache smoke workup",
      version: "cache-smoke-v1",
      status: "mvp",
      source_ids: ["PUBLIC_CACHE_SMOKE_SOURCE"],
      payload: {
        triggers: ["public cache smoke"],
        applicability: { age_group: "adult" }
      },
      updated_at: "2026-06-15T05:00:00.000Z"
    }],
    sections: [],
    sources: [{
      id: "PUBLIC_CACHE_SMOKE_SOURCE",
      source_id: "PUBLIC_CACHE_SMOKE_SOURCE",
      title: "Public cache smoke source",
      source_type: "guideline",
      citation: "Public cache smoke source",
      payload: { id: "PUBLIC_CACHE_SMOKE_SOURCE", title: "Public cache smoke source" },
      updated_at: "2026-06-15T05:00:00.000Z"
    }]
  });
}

function unexpectedNoSaveStorageKeys(snapshot) {
  return Object.keys(snapshot).filter((key) => key !== publicCatalogCacheKey);
}

function assertNoSavePatientStorage(snapshot, label, forbiddenText = []) {
  const unexpectedKeys = unexpectedNoSaveStorageKeys(snapshot);
  assert(unexpectedKeys.length === 0, `${label} should not persist patient/session localStorage keys, got ${unexpectedKeys.join(", ")}`);
  const storageText = joinedStorage(snapshot);
  for (const forbidden of forbiddenText.filter(Boolean)) {
    assert(!storageText.includes(forbidden), `${label} should not persist patient/session text "${forbidden}" in localStorage`);
  }
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
      if (element.closest(".sr-only, [aria-hidden='true']")) return false;
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

async function openFreshPage(browser, baseUrl, viewport, { preloadLocalStorage = {} } = {}) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html?fresh=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  const preloadEntries = Object.entries(preloadLocalStorage).filter(([key]) => key);
  if (preloadEntries.length) {
    await page.evaluate((entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, preloadEntries);
  }
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForFunction(() => document.body.dataset.view === "vaultAccess");
  return { context, page };
}

async function installMockQrCamera(page, qrText, options = {}) {
  await page.evaluate(({ textToScan, options: cameraOptions }) => {
    const drawQrToCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cameraOptions.width || (cameraOptions.phoneScreen ? 1280 : 1280);
      canvas.height = cameraOptions.height || (cameraOptions.phoneScreen ? 720 : 1280);
      const context2d = canvas.getContext("2d");
      context2d.fillStyle = cameraOptions.phoneScreen ? "#17282d" : "#ffffff";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
      const phoneRect = cameraOptions.phoneScreen
        ? {
          width: Math.min(520, canvas.width * 0.52),
          height: Math.min(650, canvas.height * 0.86)
        }
        : { width: canvas.width, height: canvas.height };
      phoneRect.left = Math.floor((canvas.width - phoneRect.width) / 2);
      phoneRect.top = Math.floor((canvas.height - phoneRect.height) / 2);
      if (cameraOptions.phoneScreen) {
        context2d.fillStyle = "#eff4f3";
        context2d.fillRect(phoneRect.left, phoneRect.top, phoneRect.width, phoneRect.height);
        context2d.strokeStyle = "#091519";
        context2d.lineWidth = 16;
        context2d.strokeRect(phoneRect.left, phoneRect.top, phoneRect.width, phoneRect.height);
      }
      const qr = window.qrcode(0, "L");
      qr.addData(textToScan, "Byte");
      qr.make();
      const modules = qr.getModuleCount();
      const margin = 12;
      const scanArea = Math.min(phoneRect.width, phoneRect.height) * (cameraOptions.qrScale || 1);
      const cell = Math.max(2, Math.floor(scanArea / (modules + margin * 2)));
      const size = modules * cell;
      const left = Math.floor(phoneRect.left + (phoneRect.width - size) / 2);
      const top = Math.floor(phoneRect.top + (phoneRect.height - size) / 2);
      context2d.fillStyle = cameraOptions.lowContrast ? "#505b5d" : "#000000";
      for (let row = 0; row < modules; row += 1) {
        for (let column = 0; column < modules; column += 1) {
          if (qr.isDark(row, column)) context2d.fillRect(left + column * cell, top + row * cell, cell, cell);
        }
      }
      if (cameraOptions.glare) {
        context2d.save();
        context2d.translate(canvas.width / 2, canvas.height / 2);
        context2d.rotate(-Math.PI / 7);
        context2d.fillStyle = "rgba(255, 255, 255, 0.18)";
        context2d.fillRect(-canvas.width / 2, -36, canvas.width, 72);
        context2d.restore();
      }
      return canvas;
    };
    const state = { requests: [], appliedConstraints: [] };
    window.__mockQrCameraState = state;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints) => {
          state.requests.push(constraints);
          const canvas = drawQrToCanvas();
          try {
            const reader = new window.ZXingBrowser.BrowserQRCodeReader();
            const decoded = await reader.decodeFromCanvas(canvas);
            state.sourceDecodeLength = String(typeof decoded.getText === "function" ? decoded.getText() : decoded.text || decoded.data || "").length;
          } catch (error) {
            state.sourceDecodeError = `${error?.name || "Error"}:${error?.message || ""}`;
            try {
              const context = canvas.getContext("2d", { willReadFrequently: true });
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              state.sourceJsQrDecodeLength = String(window.jsQR?.(imageData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })?.data || "").length;
            } catch (jsQrError) {
              state.sourceJsQrDecodeError = `${jsQrError?.name || "Error"}:${jsQrError?.message || ""}`;
            }
          }
          const stream = canvas.captureStream(10);
          const [track] = stream.getVideoTracks();
          if (track) {
            const frameInterval = window.setInterval(() => {
              track.requestFrame?.();
            }, 100);
            const stopTrack = track.stop.bind(track);
            track.stop = () => {
              window.clearInterval(frameInterval);
              stopTrack();
            };
            track.getCapabilities = () => ({
              focusMode: ["manual", "continuous"],
              exposureMode: ["manual", "continuous"],
              whiteBalanceMode: ["manual", "continuous"]
            });
            track.applyConstraints = async (constraintsToApply) => {
              state.appliedConstraints.push(constraintsToApply);
            };
          }
          return stream;
        }
      }
    });
  }, { textToScan: qrText, options });
}

async function openPhoneScannerPageWithMockQr(browser, baseUrl, qrText) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html?freshScanner=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html`);
  await installMockQrCamera(page, qrText);
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
  await page.waitForSelector(`#patientList .patient-card:has-text("${label}")`, { state: "attached" });
}

async function clickPatientRosterToggle(page) {
  const sidebarVisible = await page.locator("#sidebarPatientRosterButton").isVisible().catch(() => false);
  await page.click(sidebarVisible ? "#sidebarPatientRosterButton" : "#topPatientRosterButton");
}

async function testDemoCaseLoader(browser, baseUrl) {
  console.log("Checking no-save demo case loader");
  const { context, page } = await openFreshPage(browser, baseUrl, { width: 1024, height: 768 });
  await assertNoLayoutBreakage(page, "demo vault access");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace" && document.body.dataset.patientTab === "context");
  let snapshot = await storageSnapshot(page);
  assertNoSavePatientStorage(snapshot, "demo case");
  const demoAudit = await page.evaluate(() => ({
    title: document.querySelector("#caseTitle")?.textContent?.trim() || "",
    workspaceTitle: document.querySelector("#patientWorkspaceTitle")?.textContent?.trim() || "",
    oneLine: document.querySelector("#patientWorkspaceOneLine")?.textContent?.trim() || "",
    visibleTabs: Array.from(document.querySelectorAll(".patient-task-strip [role='tab']"))
      .filter((tab) => !tab.hidden && getComputedStyle(tab).display !== "none")
      .map((tab) => tab.textContent?.trim() || ""),
    admission: document.querySelector("#workspaceAdmissionInput")?.value || "",
    labs: document.querySelector("#workspaceLabsMedsInput")?.value || "",
    workupValue: document.querySelector("#patientWorkupSelect")?.value || "",
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false,
    status: document.querySelector("#statusLive")?.textContent?.trim() || ""
  }));
  assert(demoAudit.title.includes("Demo - DKA consult"), `demo should select the synthetic patient: ${JSON.stringify(demoAudit)}`);
  assert(/Synthetic adult case - no saved data/i.test(demoAudit.oneLine), `demo one-line copy should identify no-save synthetic data: ${JSON.stringify(demoAudit)}`);
  assert(!demoAudit.visibleTabs.includes("Today"), `new no-save demo should not show the follow-up Today tab: ${JSON.stringify(demoAudit)}`);
  assert(/Synthetic demo case only/i.test(demoAudit.admission) && /possible DKA|vomiting|insulin/i.test(demoAudit.admission), `demo admission context should be prefilled: ${JSON.stringify(demoAudit)}`);
  assert(/glucose 318|anion gap 22|beta-hydroxybutyrate 4\.2/i.test(demoAudit.labs), `demo labs should be prefilled with synthetic objective context: ${JSON.stringify(demoAudit)}`);
  assert(demoAudit.workupValue === "hyperglycemia_possible_dka_v1" && !demoAudit.buildDisabled, `demo should start with the DKA workup selected and ready to build: ${JSON.stringify(demoAudit)}`);
  assert(/fake|disappears/i.test(demoAudit.status), `demo status should explain fake/no-save behavior: ${JSON.stringify(demoAudit)}`);

  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded" && document.activeElement?.id === "patientSearchInput");
  const rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Demo - DKA consult"), "expanded roster should expose the demo patient");

  await clickPatientTab(page, "workup");
  await showPatientWorkupsPane(page);
  await page.fill("#patientWorkupConcernInput", "dka");
  await page.waitForSelector('#patientWorkupResults [data-module-id="hyperglycemia_possible_dka_v1"]');
  await page.click('#patientWorkupResults .workup-result-row[data-module-id="hyperglycemia_possible_dka_v1"]');
  await page.waitForFunction(() => document.querySelector("#patientWorkupSelect")?.value === "hyperglycemia_possible_dka_v1");
  await clickPatientTab(page, "checklist");
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForSelector("#bedsideView:not([hidden])");
  const bedsideTitle = await page.textContent("#bedsideDesktopCaseTitle");
  assert(/Demo - DKA consult/i.test(bedsideTitle), `bedside checklist should retain demo patient scope, got ${bedsideTitle}`);
  await page.click("#bedsideHeaderSettingsButton");
  await page.waitForSelector("#workspaceView:not([hidden])");
  await clickPatientTab(page, "evidence");
  await page.waitForSelector("#patientEvidencePanel:not([hidden])");
  const demoPromptTemplate = await page.inputValue("#patientEvidencePromptPreview");
  assert(/{{source_context}}|{{deidentified_patient_context}}/i.test(demoPromptTemplate), "demo OpenEvidence prompt template should show editable patient-context variables");
  assert(!/Demo - DKA consult/i.test(demoPromptTemplate), "editable prompt template should not inline the selected demo patient title");
  await page.click("#copyPromptButton");
  await page.waitForSelector("#phiOverlay:not([hidden])");
  const demoPromptCopyPreview = await page.textContent("#phiPreviewText");
  assert(/Demo - DKA consult/i.test(demoPromptCopyPreview), "copied demo OpenEvidence prompt should resolve the selected demo patient title");
  assert(!/Synthetic adult DKA consult/i.test(demoPromptCopyPreview), "demo prompt copy should not fall back to stale sample context");
  await page.click("#closePhiOverlayButton");
  await page.click('#patientEvidenceTaskStrip [data-task-id="checklist_improvement_review"]');
  await page.waitForFunction(() => /Checklist improvement review/i.test(document.querySelector("#patientSelectedTaskTitle")?.textContent || ""));
  const demoRefinement = {
    schema: "workup_refinement_v1",
    workupId: "hyperglycemia_possible_dka_v1",
    title: "Hyperglycemia / possible DKA or HHS",
    replaceMode: "full_replacement",
    sections: [
      {
        title: "ENDOCRINE / METABOLIC",
        organSystemKey: "endocrine_metabolic",
        items: [
          {
            id: "demo_sglt2_use",
            category: "bedside",
            label: "Any SGLT2 inhibitor use?",
            answerMode: "single",
            options: ["No", "Yes", "Unknown", "Other"],
            normalAnswers: ["No"],
            exclusiveGroups: [["No", "Yes", "Unknown"]],
            patientSpecific: false,
            rationale: "Synthetic structured refinement for no-save demo testing.",
            citations: ["Synthetic citation"]
          }
        ]
      }
    ],
    removedItemLabels: []
  };
  await page.fill("#patientEvidenceAnswerInput", `\`\`\`json\n${JSON.stringify(demoRefinement, null, 2)}\n\`\`\``);
  await page.waitForFunction(() => /Structured refinement ready/i.test(document.querySelector("#patientEvidenceChangePreview")?.textContent || ""));
  await page.click("#patientSaveDefaultEvidenceRefinementButton");
  await page.waitForFunction(() => document.body.dataset.patientTab === "checklist");
  await page.waitForFunction(() => /SGLT2 inhibitor use/i.test(document.querySelector("#workspaceChecklistPreviewList")?.textContent || document.body.innerText || ""));
  snapshot = await storageSnapshot(page);
  assert(Object.keys(snapshot).length === 0, `demo workflow should remain no-save after refinement walkthrough, got ${Object.keys(snapshot).join(", ")}`);
  await context.close();
}

async function testSinglePatientBypass(browser, baseUrl) {
  console.log("Checking single-patient no-save path");
  const { context, page } = await openFreshPage(browser, baseUrl, { width: 1024, height: 768 });
  await assertNoLayoutBreakage(page, "desktop vault access");
  const desktopHomeAudit = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return !element.hidden && getComputedStyle(element).display !== "none" && rect.width > 0 && rect.height > 0;
    };
    return {
      openVaultVisible: visible("#openVaultSection"),
      createVaultVisible: visible("#createVaultSection"),
      phoneEntryVisible: visible("#phoneBundleEntrySection"),
      singlePatientVisible: visible("#singlePatientEntrySection")
    };
  });
  assert(desktopHomeAudit.createVaultVisible && !desktopHomeAudit.openVaultVisible, `desktop home with no vault should offer create only: ${JSON.stringify(desktopHomeAudit)}`);
  assert(!desktopHomeAudit.phoneEntryVisible, `desktop home should not show bedside checklist entry: ${JSON.stringify(desktopHomeAudit)}`);
  assert(desktopHomeAudit.singlePatientVisible, `desktop home should keep single-patient workflow available: ${JSON.stringify(desktopHomeAudit)}`);
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
  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded" && document.activeElement?.id === "patientSearchInput");
  let snapshot = await storageSnapshot(page);
  assertNoSavePatientStorage(snapshot, "single-patient details", ["Focused no-save pneumonia", "oxygen need"]);
  await page.fill("#patientSearchInput", "missing");
  const emptyText = await page.textContent("#patientList");
  assert(/No patients match that search/.test(emptyText), "single-patient search should show an empty state without freezing");
  await page.fill("#patientSearchInput", "");
  const restoredText = await page.textContent("#patientList");
  assert(restoredText.includes("Temporary Room"), "clearing single-patient search should restore the roster");
  await page.click("#lockVaultButton");
  await page.waitForFunction(() => document.body.dataset.view === "vaultAccess");
  snapshot = await storageSnapshot(page);
  assertNoSavePatientStorage(snapshot, "locking a single-patient workflow");
  await context.close();
}

async function testPhoneManualFallbackHome(browser, baseUrl) {
  console.log("Checking phone QR scanner entry");
  const { context, page } = await openFreshPage(browser, baseUrl, { width: 390, height: 844 });
  await assertNoLayoutBreakage(page, "phone QR scanner vault access");
  const audit = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return !element.hidden && getComputedStyle(element).display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const manualFallback = document.querySelector(".phone-manual-fallback");
    return {
      title: document.querySelector("#vaultAccessTitle")?.textContent || "",
      entryTitle: document.querySelector("#phoneBundleEntryTitle")?.textContent || "",
      phoneEntryVisible: visible("#phoneBundleEntrySection"),
      scannerButtonVisible: visible("#startPhoneQrScannerButton"),
      scannerFrameVisible: visible(".phone-scanner-frame"),
      manualFallbackVisible: visible(".phone-manual-fallback"),
      manualFallbackOpen: Boolean(manualFallback?.open),
      pasteVisible: visible("#pastePhoneBundleEntryButton"),
      loadVisible: visible("#loadPhoneBundleEntryButton"),
      openVaultVisible: visible("#openVaultSection"),
      createVaultVisible: visible("#createVaultSection"),
      singlePatientVisible: visible("#singlePatientEntrySection")
    };
  });
  assert(/Scan desktop QR/i.test(audit.title), `phone entry title should default to scanning: ${JSON.stringify(audit)}`);
  assert(/Scan desktop QR/i.test(audit.entryTitle), `phone bundle section should default to scanner: ${JSON.stringify(audit)}`);
  assert(audit.phoneEntryVisible && audit.scannerButtonVisible && audit.scannerFrameVisible, `phone entry should expose the QR scanner as the primary action: ${JSON.stringify(audit)}`);
  assert(audit.manualFallbackVisible && !audit.manualFallbackOpen, `manual paste should be available but collapsed: ${JSON.stringify(audit)}`);
  assert(!audit.pasteVisible && !audit.loadVisible, `manual paste controls should stay hidden until the fallback is opened: ${JSON.stringify(audit)}`);
  assert(!audit.openVaultVisible && !audit.createVaultVisible && !audit.singlePatientVisible, `phone entry should not show vault or single-patient desktop actions: ${JSON.stringify(audit)}`);
  await context.close();
}

async function testPhoneBundleRoundTrip(browser, baseUrl) {
  console.log("Checking desktop-to-phone interview handoff");
  const { context: desktopContext, page: desktopPage } = await openFreshPage(browser, baseUrl, { width: 1024, height: 768 });
  await desktopPage.click("#demoCaseButton");
  await desktopPage.waitForFunction(() => document.body.dataset.view === "workspace" && document.body.dataset.patientTab === "context");
  await clickPatientTab(desktopPage, "checklist");
  await desktopPage.click("#workspaceOpenBedsideChecklistButton");
  await desktopPage.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  if (await desktopPage.locator("#bedsideView:not([hidden])").isVisible().catch(() => false)) {
    await desktopPage.click("#bedsideMoreActionsButton");
  } else {
    await desktopPage.click("#workspaceChecklistPhoneButton");
  }
  await desktopPage.waitForFunction(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    return visible("#handoffView") || visible("#patientFindingsPanel");
  });
  await desktopPage.waitForFunction(() => document.querySelector("#phonePayload")?.value.length > 100);
  await desktopPage.waitForSelector("#phoneQrCode svg", { timeout: 45000 });
  const desktopPayload = await desktopPage.inputValue("#phonePayload");
  const desktopBundle = decodeLocalBundle(desktopPayload);
  const desktopCode = (await desktopPage.textContent("#phoneTransferCode")).trim();
  const desktopQrAudit = await desktopPage.evaluate(() => ({
    hasQr: Boolean(document.querySelector("#phoneQrCode svg")),
    qrLink: document.querySelector("#phoneQrPanel")?.dataset.qrLink || "",
    qrStatus: document.querySelector("#phoneQrStatus")?.textContent || "",
    qrViewBox: document.querySelector("#phoneQrCode svg")?.getAttribute("viewBox") || "",
    qrBoxWidth: document.querySelector("#phoneQrCode")?.getBoundingClientRect().width || 0,
    regenerateVisible: !document.querySelector("#exportPhoneContextButton")?.hidden,
    copyVisible: !document.querySelector("#copyPhonePayloadButton")?.hidden,
    downloadVisible: !document.querySelector("#downloadPhonePayloadButton")?.hidden,
    regenerateText: document.querySelector("#exportPhoneContextButton")?.textContent || "",
    copyText: document.querySelector("#copyPhonePayloadButton")?.textContent || "",
    downloadText: document.querySelector("#downloadPhonePayloadButton")?.textContent || ""
  }));
  const qrViewBoxSize = Number(desktopQrAudit.qrViewBox.match(/0 0 ([\d.]+) /)?.[1] || 0);
  assert(desktopQrAudit.hasQr && /opens directly into bedside mode/i.test(desktopQrAudit.qrStatus), `desktop handoff should render QR as the primary action: ${JSON.stringify(desktopQrAudit)}`);
  assert(qrViewBoxSize > 0 && qrViewBoxSize <= 600, `desktop QR should avoid unscannable density: ${JSON.stringify(desktopQrAudit)}`);
  assert(desktopQrAudit.qrBoxWidth >= 300, `desktop QR should render large enough for phone cameras: ${JSON.stringify(desktopQrAudit)}`);
  assert(desktopQrAudit.regenerateVisible && desktopQrAudit.copyVisible && desktopQrAudit.downloadVisible, `desktop handoff should expose regenerate/copy/download secondary actions: ${JSON.stringify(desktopQrAudit)}`);
  assert(/^Regenerate$/i.test(desktopQrAudit.regenerateText.trim()) && /Copy bundle/i.test(desktopQrAudit.copyText) && /^Download$/i.test(desktopQrAudit.downloadText.trim()), `desktop secondary actions should be simple regenerate/copy/download labels: ${JSON.stringify(desktopQrAudit)}`);
  assert(desktopQrAudit.qrLink.includes("#phoneBundle="), `desktop QR panel should expose the deep link for tests: ${JSON.stringify(desktopQrAudit).slice(0, 500)}`);
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(desktopCode), `desktop handoff should generate a pairing code, got ${desktopCode}`);
  assert(/^[a-f0-9]{8}$/.test(desktopBundle.checklistFingerprint || ""), `desktop handoff should include a compact checklist fingerprint, got ${desktopBundle.checklistFingerprint}`);
  assert(desktopBundle.checklistWorkupSignature === undefined, "phone handoff should not send the full canonical workup signature.");

  const qrLink = desktopQrAudit.qrLink;
  const qrPhoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await qrPhoneContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const qrPhonePage = await qrPhoneContext.newPage();
  await qrPhonePage.goto(qrLink);
  await qrPhonePage.waitForSelector("#bedsideView:not([hidden])", { timeout: 45000 });
  await qrPhonePage.waitForFunction(() => document.querySelectorAll(".checklist-row").length >= 8);
  await assertNoLayoutBreakage(qrPhonePage, "qr phone bedside checklist");
  const qrPhoneAudit = await qrPhonePage.evaluate(() => ({
    view: document.body.dataset.view,
    caseTitle: document.querySelector("#bedsideMobileCaseTitle")?.textContent?.trim() || "",
    subhead: document.querySelector("#bedsideMobileSubtitle")?.textContent?.trim() || "",
    progress: document.querySelector("#bedsideMobileProgress")?.textContent?.trim() || "",
    rowCount: document.querySelectorAll(".checklist-row").length,
    hash: window.location.hash,
    storageKeys: Object.keys(localStorage)
  }));
  assert(qrPhoneAudit.view === "bedside", `QR link should bypass vault entry and open bedside view: ${JSON.stringify(qrPhoneAudit)}`);
  assert(/Demo - DKA consult/i.test(qrPhoneAudit.caseTitle), `QR link should preserve case title: ${JSON.stringify(qrPhoneAudit)}`);
  assert(/bedside physical exam/i.test(qrPhoneAudit.subhead), `QR bedside screen should match the selected bedside exam design: ${JSON.stringify(qrPhoneAudit)}`);
  assert(/\d+\/\d+ answered/i.test(qrPhoneAudit.progress), `QR bedside screen should show mobile progress in the header: ${JSON.stringify(qrPhoneAudit)}`);
  assert(qrPhoneAudit.rowCount >= 8, `QR link should load checklist rows: ${JSON.stringify(qrPhoneAudit)}`);
  assert(qrPhoneAudit.hash === "", `QR phone import should clear payload fragment after load: ${JSON.stringify(qrPhoneAudit)}`);
  assert(qrPhoneAudit.storageKeys.length === 0, `QR phone session should not write patient data to localStorage: ${JSON.stringify(qrPhoneAudit)}`);
  await qrPhoneContext.close();

  const { context: scannerContext, page: scannerPage } = await openPhoneScannerPageWithMockQr(browser, baseUrl, qrLink);
  await scannerPage.click("#startPhoneQrScannerButton");
  try {
    await scannerPage.waitForSelector("#bedsideView:not([hidden])", { timeout: 45000 });
  } catch (error) {
    const scannerFailureAudit = await scannerPage.evaluate(async () => {
      const video = document.querySelector("#phoneQrScannerVideo");
      let manualDecodeLength = 0;
      let manualDecodeError = "";
      let manualJsQrDecodeLength = 0;
      let manualJsQrDecodeError = "";
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, (video?.videoWidth || 0) * 2);
        canvas.height = Math.max(1, (video?.videoHeight || 0) * 2);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const reader = new window.ZXingBrowser.BrowserQRCodeReader();
        const decoded = await reader.decodeFromCanvas(canvas);
        manualDecodeLength = String(typeof decoded.getText === "function" ? decoded.getText() : decoded.text || decoded.data || "").length;
      } catch (error) {
        manualDecodeError = `${error?.name || "Error"}:${error?.message || ""}`;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, (video?.videoWidth || 0) * 2);
          canvas.height = Math.max(1, (video?.videoHeight || 0) * 2);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.imageSmoothingEnabled = false;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          manualJsQrDecodeLength = String(window.jsQR?.(imageData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })?.data || "").length;
        } catch (jsQrError) {
          manualJsQrDecodeError = `${jsQrError?.name || "Error"}:${jsQrError?.message || ""}`;
        }
      }
      return {
        view: document.body.dataset.view,
        scannerStatus: document.querySelector("#phoneQrScannerStatus")?.textContent || "",
        entryStatus: document.querySelector("#phoneBundleEntryStatus")?.textContent || "",
        hasVideo: Boolean(video?.srcObject),
        videoWidth: video?.videoWidth || 0,
        videoHeight: video?.videoHeight || 0,
        readyState: video?.readyState || 0,
        manualDecodeLength,
        manualDecodeError,
        manualJsQrDecodeLength,
        manualJsQrDecodeError,
        mockState: window.__mockQrCameraState || null
      };
    });
    throw new Error(`camera scanner should open bedside view from the QR feed: ${JSON.stringify(scannerFailureAudit)}`);
  }
  await scannerPage.waitForFunction(() => document.querySelectorAll(".checklist-row").length >= 8);
  await assertNoLayoutBreakage(scannerPage, "phone QR camera scanner bedside checklist");
  const scannerAudit = await scannerPage.evaluate(() => ({
    view: document.body.dataset.view,
    caseTitle: document.querySelector("#bedsideMobileCaseTitle")?.textContent?.trim() || "",
    rowCount: document.querySelectorAll(".checklist-row").length,
    storageKeys: Object.keys(localStorage)
  }));
  assert(scannerAudit.view === "bedside", `camera scanner should open bedside view from the QR feed: ${JSON.stringify(scannerAudit)}`);
  assert(/Demo - DKA consult/i.test(scannerAudit.caseTitle), `camera scanner should preserve case title: ${JSON.stringify(scannerAudit)}`);
  assert(scannerAudit.rowCount >= 8, `camera scanner should load checklist rows: ${JSON.stringify(scannerAudit)}`);
  assert(scannerAudit.storageKeys.length === 0, `camera scanner session should not write patient data to localStorage: ${JSON.stringify(scannerAudit)}`);
  await scannerContext.close();

  const { context: phoneContext, page: phonePage } = await openFreshPage(
    browser,
    baseUrl,
    { width: 390, height: 844 },
    { preloadLocalStorage: { [publicCatalogCacheKey]: publicCatalogCacheFixture() } }
  );
  await assertNoLayoutBreakage(phonePage, "phone bundle vault entry");
  await phonePage.click(".phone-manual-fallback summary");
  await phonePage.waitForFunction(() => document.querySelector(".phone-manual-fallback")?.open === true);
  await phonePage.fill("#phoneBundleEntryInput", JSON.stringify({ code: "WRNG-0000", payload: desktopPayload }, null, 2));
  await phonePage.click("#loadPhoneBundleEntryButton");
  await phonePage.waitForFunction(() => /code does not match/i.test(document.querySelector("#phoneBundleEntryStatus")?.textContent || ""));
  const mismatchPhoneAudit = await phonePage.evaluate(() => ({
    view: document.body.dataset.view,
    status: document.querySelector("#phoneBundleEntryStatus")?.textContent || "",
    storageKeys: Object.keys(localStorage)
  }));
  assert(mismatchPhoneAudit.view === "vaultAccess", `mismatched phone bundle should stay on vault entry: ${JSON.stringify(mismatchPhoneAudit)}`);
  assert(mismatchPhoneAudit.storageKeys.every((key) => key === publicCatalogCacheKey), `rejected phone bundle should persist only public catalog cache storage: ${JSON.stringify(mismatchPhoneAudit)}`);
  await phonePage.fill("#phoneBundleEntryInput", JSON.stringify({ code: desktopCode, payload: desktopPayload }, null, 2));
  await phonePage.click("#loadPhoneBundleEntryButton");
  await phonePage.waitForSelector("#bedsideView:not([hidden])");
  await phonePage.waitForFunction(() => document.querySelectorAll(".checklist-row").length >= 8);
  await assertNoLayoutBreakage(phonePage, "phone bundle bedside checklist");
  const phoneLoadedAudit = await phonePage.evaluate(() => ({
    view: document.body.dataset.view,
    caseTitle: document.querySelector("#bedsideMobileCaseTitle")?.textContent?.trim() || "",
    rowCount: document.querySelectorAll(".checklist-row").length,
    storageKeys: Object.keys(localStorage)
  }));
  assert(phoneLoadedAudit.view === "bedside", `phone bundle should open directly to bedside view: ${JSON.stringify(phoneLoadedAudit)}`);
  assert(/Demo - DKA consult/i.test(phoneLoadedAudit.caseTitle), `phone bundle should preserve case title: ${JSON.stringify(phoneLoadedAudit)}`);
  assert(phoneLoadedAudit.rowCount >= 8, `phone bundle should load checklist rows: ${JSON.stringify(phoneLoadedAudit)}`);
  assert(phoneLoadedAudit.storageKeys.every((key) => key === publicCatalogCacheKey), `phone bundle session should persist only public catalog cache storage: ${JSON.stringify(phoneLoadedAudit)}`);

  const answerMode = await phonePage.evaluate(() => {
    const chip = document.querySelector(".checklist-row .answer-chip");
    if (chip) {
      chip.click();
      return "chip";
    }
    const endorsement = document.querySelector(".checklist-row .endorsement-button");
    if (endorsement) {
      endorsement.click();
      return "endorsement";
    }
    const select = document.querySelector(".checklist-row select.answer-select");
    if (select && select.options.length > 1) {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return "select";
    }
    return "";
  });
  assert(answerMode, "phone checklist should expose an answer control");
  await phonePage.waitForFunction(() => /[1-9]\d*\/\d+ answered/.test(document.querySelector("#answeredCount")?.textContent || ""));
  await phonePage.evaluate(() => {
    for (const row of document.querySelectorAll(".checklist-row")) {
      if (row.classList.contains("is-answered")) continue;
      const chip = row.querySelector(".answer-chip");
      if (chip) {
        chip.click();
        continue;
      }
      const endorsement = row.querySelector(".endorsement-button");
      if (endorsement) {
        endorsement.click();
        continue;
      }
      const select = row.querySelector("select.answer-select");
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });
  await phonePage.waitForFunction(() => document.body.dataset.bedsideComplete === "true");
  await phonePage.waitForSelector("#bedsideCompletionPanel:not([hidden])");
  await phonePage.waitForSelector("#bedsideCompletionQrCode svg", { timeout: 45000 });
  const returnQrText = await phonePage.evaluate(() => document.querySelector("#bedsideCompletionPanel")?.dataset.qrText || "");
  assert(/^(?:rgz|rj)\./.test(returnQrText), "completed phone return QR should expose a compact local return token");
  const completionAudit = await phonePage.evaluate(() => ({
    title: document.querySelector("#bedsideCompletionTitle")?.textContent || "",
    progress: document.querySelector("#bedsideMobileProgress")?.textContent || "",
    hasQr: Boolean(document.querySelector("#bedsideCompletionQrCode svg")),
    copyText: document.querySelector("#completionCopyPhoneReturnPayloadButton")?.textContent || "",
    maximizeVisible: Boolean(document.querySelector("#maximizeBedsideReturnQrButton")?.getBoundingClientRect().height),
    summaryRows: document.querySelectorAll(".bedside-completion-summary-row").length
  }));
  assert(/Findings ready/i.test(completionAudit.title) && /26\/26 answered/i.test(completionAudit.progress), `completed phone screen should default to findings-ready QR state: ${JSON.stringify(completionAudit)}`);
  assert(completionAudit.hasQr && /Copy findings for computer/i.test(completionAudit.copyText) && completionAudit.maximizeVisible && completionAudit.summaryRows >= 1, `completed phone screen should show QR, copy fallback, maximize, and summary: ${JSON.stringify(completionAudit)}`);
  await phonePage.click("#maximizeBedsideReturnQrButton");
  await phonePage.waitForSelector("#phoneReturnQrOverlay:not([hidden])");
  await phonePage.waitForSelector("#phoneReturnQrCode svg", { timeout: 45000 });
  const phoneReturnQrAudit = await phonePage.evaluate(() => ({
    status: document.querySelector("#phoneReturnQrStatus")?.textContent || "",
    hasQr: Boolean(document.querySelector("#phoneReturnQrCode svg")),
    isMaximized: document.querySelector("#phoneReturnQrOverlay")?.classList.contains("is-qr-maximized") || false,
    copyButtonVisible: Boolean(document.querySelector("#copyPhoneReturnPayloadButton")?.getBoundingClientRect().height)
  }));
  assert(phoneReturnQrAudit.hasQr && phoneReturnQrAudit.isMaximized && phoneReturnQrAudit.copyButtonVisible, `phone return QR modal should render maximized QR and fallback copy: ${JSON.stringify(phoneReturnQrAudit)}`);
  await phonePage.click("#copyPhoneReturnPayloadButton");
  await phonePage.waitForSelector("#phiOverlay:not([hidden])");
  await phonePage.click("#confirmPhiActionButton");
  await phonePage.waitForFunction(() => document.querySelector("#phiOverlay")?.hidden === true);
  const returnPayload = await phonePage.evaluate(async () => navigator.clipboard.readText());
  assert(returnPayload.length > 100, "phone return payload should copy to clipboard after PHI review");
  const mismatchedReturn = decodeLocalBundle(returnPayload);
  assert(mismatchedReturn.checklistFingerprint === desktopBundle.checklistFingerprint, "phone return bundle should preserve the laptop checklist fingerprint.");
  mismatchedReturn.code = "WRNG-0000";
  const mismatchedReturnPayload = encodeLocalBundle(mismatchedReturn);
  const staleChecklistReturn = { ...decodeLocalBundle(returnPayload), checklistFingerprint: "00000000" };
  const staleChecklistReturnPayload = encodeLocalBundle(staleChecklistReturn);
  const staleItemReturn = decodeLocalBundle(returnPayload);
  staleItemReturn.answers = { ...(staleItemReturn.answers || {}), "999:999": "Injected stale answer" };
  staleItemReturn.itemNotes = { ...(staleItemReturn.itemNotes || {}), "999:999": "Injected stale note" };
  const staleItemReturnPayload = encodeLocalBundle(staleItemReturn);
  let phoneSnapshot = await storageSnapshot(phonePage);
  assertNoSavePatientStorage(phoneSnapshot, "phone interview after answers", [
    "Demo - DKA consult",
    "Synthetic demo case",
    "Imported bundle",
    "Injected stale answer",
    "Injected stale note"
  ]);
  await phoneContext.close();

  await desktopPage.fill("#phoneImportInput", mismatchedReturnPayload);
  await desktopPage.click("#importPhoneFindingsButton");
  await desktopPage.waitForTimeout(250);
  const mismatchDesktopAudit = await desktopPage.evaluate(() => ({
    status: document.querySelector("#handoffStatus")?.textContent || "",
    finalText: document.querySelector("#finalUpdatePreview")?.textContent || "",
    answeredRows: document.querySelectorAll(".checklist-row.is-answered").length
  }));
  assert(/does not match this laptop handoff code/i.test(mismatchDesktopAudit.status), `mismatched return bundle should show a code mismatch error: ${JSON.stringify(mismatchDesktopAudit)}`);
  assert(!/Imported phone findings/i.test(mismatchDesktopAudit.finalText), `mismatched return bundle should not update final text: ${JSON.stringify(mismatchDesktopAudit)}`);
  assert(mismatchDesktopAudit.answeredRows === 0, `mismatched return bundle should not merge answers: ${JSON.stringify(mismatchDesktopAudit)}`);

  await desktopPage.fill("#phoneImportInput", staleChecklistReturnPayload);
  await desktopPage.click("#importPhoneFindingsButton");
  await desktopPage.waitForTimeout(250);
  const staleChecklistDesktopAudit = await desktopPage.evaluate(() => ({
    status: document.querySelector("#handoffStatus")?.textContent || "",
    finalText: document.querySelector("#finalUpdatePreview")?.textContent || "",
    answeredRows: document.querySelectorAll(".checklist-row.is-answered").length
  }));
  assert(/different checklist|fresh phone bundle|checklist fingerprint/i.test(staleChecklistDesktopAudit.status), `stale checklist return bundle should show a fingerprint mismatch error: ${JSON.stringify(staleChecklistDesktopAudit)}`);
  assert(!/Imported phone findings/i.test(staleChecklistDesktopAudit.finalText), `stale checklist return bundle should not update final text: ${JSON.stringify(staleChecklistDesktopAudit)}`);
  assert(staleChecklistDesktopAudit.answeredRows === 0, `stale checklist return bundle should not merge answers: ${JSON.stringify(staleChecklistDesktopAudit)}`);

  await installMockQrCamera(desktopPage, returnQrText, {
    phoneScreen: true,
    lowContrast: true,
    glare: true,
    qrScale: 0.86
  });
  await desktopPage.click("#startReturnQrScannerButton");
  await desktopPage.waitForFunction(() => /Phone checklist answers imported/i.test(document.querySelector("#handoffStatus")?.textContent || ""), null, { timeout: 45000 });
  const desktopScannerAudit = await desktopPage.evaluate(() => ({
    scannerStatus: document.querySelector("#returnQrScannerStatus")?.textContent || "",
    handoffStatus: document.querySelector("#handoffStatus")?.textContent || "",
    importValue: document.querySelector("#phoneImportInput")?.value || "",
    answeredRows: document.querySelectorAll(".checklist-row.is-answered").length,
    firstFacingMode: window.__mockQrCameraState?.requests?.[0]?.video?.facingMode?.ideal || "",
    appliedConstraints: JSON.stringify(window.__mockQrCameraState?.appliedConstraints || [])
  }));
  assert(/imported/i.test(desktopScannerAudit.scannerStatus), `desktop scanner should report imported phone QR: ${JSON.stringify(desktopScannerAudit)}`);
  assert(/^(?:rgz|rj)\./.test(desktopScannerAudit.importValue) || /phoneReturn=/.test(desktopScannerAudit.importValue), `desktop scanner should place scanned QR text in the import box: ${JSON.stringify(desktopScannerAudit)}`);
  assert(desktopScannerAudit.answeredRows >= 1, `desktop scanner should merge answered checklist rows: ${JSON.stringify(desktopScannerAudit)}`);
  assert(desktopScannerAudit.firstFacingMode === "user", `desktop return scanner should prefer the user-facing laptop camera: ${JSON.stringify(desktopScannerAudit)}`);
  assert(/focusMode.*continuous|continuous.*focusMode/.test(desktopScannerAudit.appliedConstraints), `desktop return scanner should request continuous focus when available: ${JSON.stringify(desktopScannerAudit)}`);

  await desktopPage.fill("#phoneImportInput", staleItemReturnPayload);
  await desktopPage.click("#importPhoneFindingsButton");
  await desktopPage.waitForFunction(() => /Phone checklist answers imported/i.test(document.querySelector("#handoffStatus")?.textContent || ""));
  await desktopPage.waitForFunction(() => /Imported phone findings:[\s\S]+:/i.test(document.querySelector("#finalUpdatePreview")?.textContent || ""));
  const desktopImportAudit = await desktopPage.evaluate(() => ({
    handoffStatus: document.querySelector("#handoffStatus")?.textContent?.trim() || "",
    finalText: document.querySelector("#finalUpdatePreview")?.textContent || "",
    answeredRows: document.querySelectorAll(".checklist-row.is-answered").length
  }));
  assert(desktopImportAudit.answeredRows >= 1, `desktop import should merge answered checklist rows: ${JSON.stringify(desktopImportAudit)}`);
  assert(/stale phone items ignored/i.test(desktopImportAudit.handoffStatus), `desktop import should report stale phone item keys were ignored: ${JSON.stringify(desktopImportAudit)}`);
  assert(/Imported phone findings:[\s\S]+:/i.test(desktopImportAudit.finalText), "desktop final update should include returned phone checklist findings");
  await desktopContext.close();
}

async function testVaultWorkspaceAtViewport(browser, baseUrl, viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  console.log(`Checking vault workspace at ${label}`);
  const { context, page } = await openFreshPage(browser, baseUrl, viewport);
  const patientLabel = "Room 12";
  await assertNoLayoutBreakage(page, `vault access ${label}`);
  await createVault(page);
  await admitPatient(page);
  await assertNoLayoutBreakage(page, `workspace ${label}`);
  const unbuiltHandoffAudit = await page.evaluate(() => ({
    checklistStatus: document.querySelector("#workspaceChecklistStatus")?.textContent || "",
    sendHidden: document.querySelector("#workspaceChecklistPhoneButton")?.hidden,
    findingsSendHidden: document.querySelector("#workspaceSendPhoneButton")
      ? Boolean(document.querySelector("#workspaceSendPhoneButton")?.hidden)
      : true,
    handoffHidden: document.querySelector("#workspaceHandoffButton")?.hidden
  }));
  assert(
    /Not built/i.test(unbuiltHandoffAudit.checklistStatus)
      && unbuiltHandoffAudit.sendHidden
      && unbuiltHandoffAudit.findingsSendHidden
      && unbuiltHandoffAudit.handoffHidden,
    `desktop should hide all phone handoff actions until a checklist exists: ${JSON.stringify(unbuiltHandoffAudit)}`
  );

  const assertRosterState = async (expectedExpanded, reason) => {
    const audit = await page.evaluate(() => {
      const patientRail = document.querySelector(".patient-rail");
      const rosterButton = document.querySelector("#sidebarPatientRosterButton");
      const topRosterButton = document.querySelector("#topPatientRosterButton");
      return {
        view: document.body.dataset.view,
        patientTab: document.body.dataset.patientTab,
        rosterState: document.body.dataset.patientRoster,
        patientRailDisplay: patientRail ? getComputedStyle(patientRail).display : "",
        contextRailPresent: Boolean(document.querySelector(".context-rail")),
        navLabel: document.querySelector("#sidebarPatientRosterLabel")?.textContent?.trim() || "",
        navExpanded: rosterButton?.getAttribute("aria-expanded") || "",
        topLabel: document.querySelector("#topPatientRosterLabel")?.textContent?.trim() || "",
        topExpanded: topRosterButton?.getAttribute("aria-expanded") || "",
        activeElementId: document.activeElement?.id || ""
      };
    });
    const expectedDisplay = expectedExpanded ? "not-none" : "none";
    assert(audit.contextRailPresent === false, `${reason}: right status rail should not be rendered: ${JSON.stringify(audit)}`);
    assert(audit.rosterState === (expectedExpanded ? "expanded" : "collapsed"), `${reason}: body roster state mismatch: ${JSON.stringify(audit)}`);
    assert(audit.navLabel === (expectedExpanded ? "Hide roster" : "Show roster"), `${reason}: roster nav label mismatch: ${JSON.stringify(audit)}`);
    assert(audit.navExpanded === String(expectedExpanded), `${reason}: roster nav aria-expanded mismatch: ${JSON.stringify(audit)}`);
    assert(audit.topLabel === (expectedExpanded ? "Hide roster" : "Show roster"), `${reason}: top roster label mismatch: ${JSON.stringify(audit)}`);
    assert(audit.topExpanded === String(expectedExpanded), `${reason}: top roster aria-expanded mismatch: ${JSON.stringify(audit)}`);
    if (expectedDisplay === "none") {
      assert(audit.patientRailDisplay === "none", `${reason}: roster rail should be hidden: ${JSON.stringify(audit)}`);
    } else {
      assert(audit.patientRailDisplay !== "none", `${reason}: roster rail should be visible: ${JSON.stringify(audit)}`);
    }
    return audit;
  };

  const sidebarLabels = await page.locator(".sidebar .nav-button").allTextContents();
  assert(sidebarLabels.join("|") === "Show roster|Admit patient|Demo case|Quick de-ID|Workup Studio|About privacy", `sidebar should expose only shift utilities, got ${sidebarLabels.join("|")}`);
  if (viewport.width >= 760) {
    const menuChromeAudit = await page.evaluate(() => {
      const visible = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return !node.hidden && getComputedStyle(node).display !== "none" && rect.width > 0 && rect.height > 0;
      };
      return {
        sidebarLabel: document.querySelector(".sidebar")?.getAttribute("aria-label") || "",
        navLabel: document.querySelector(".sidebar nav")?.getAttribute("aria-label") || "",
        visibleHeading: document.querySelector(".layout-sidebar-head")?.textContent?.trim() || "",
        collapseButtonVisible: visible("#layoutNavCollapseButton"),
        floatVisible: visible("#layoutNavFloatButton"),
        navCollapsed: document.body.dataset.navCollapsed
      };
    });
    assert(menuChromeAudit.sidebarLabel === "App menu" && menuChromeAudit.navLabel === "Menu", `sidebar should use user-facing menu labels: ${JSON.stringify(menuChromeAudit)}`);
    assert(!menuChromeAudit.visibleHeading && !menuChromeAudit.collapseButtonVisible && !menuChromeAudit.floatVisible && menuChromeAudit.navCollapsed === "false", `desktop menu should not show header or collapse controls: ${JSON.stringify(menuChromeAudit)}`);
    const startSidebarWidth = await page.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
    await page.locator("#layoutSidebarResizeHandle").press("ArrowRight");
    const resizedNavAudit = await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("prerounding-layout-preferences-v1") || "{}");
      return {
        width: Math.round(document.querySelector(".sidebar").getBoundingClientRect().width),
        storedWidth: prefs?.sizes?.appSidebar,
        collapsed: prefs?.navCollapsed
      };
    });
    assert(resizedNavAudit.width > startSidebarWidth && resizedNavAudit.storedWidth >= resizedNavAudit.width - 2 && resizedNavAudit.collapsed === false, `menu width should resize and persist without collapsing: ${JSON.stringify({ startSidebarWidth, resizedNavAudit })}`);
  }
  await assertRosterState(false, `default collapsed roster ${label}`);
  const tabLabels = await page.locator(".patient-task-strip [role='tab']:visible").allTextContents();
  const expectedTabLabels = viewport.width < 760
    ? ""
    : "Summary|Context|Workup|Checklist|Findings|Evidence";
  assert(tabLabels.join("|") === expectedTabLabels, `patient tabs should match device workflow order, got ${tabLabels.join("|")}`);
  if (viewport.width >= 760) {
    await page.evaluate(() => document.querySelector('[data-patient-tab="today"]')?.click());
    await page.waitForFunction(() => document.body.dataset.patientTab === "context");
    await page.fill("#workspaceContinuityInput", "Following from yesterday: oxygen weaned overnight; repeat labs and antibiotic plan due today.");
    await page.click("#saveContinuityButton");
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".patient-task-strip [role='tab']"))
      .filter((tab) => !tab.hidden && getComputedStyle(tab).display !== "none")
      .map((tab) => tab.textContent?.trim() || "")
      .includes("Today"));
    const followedTabLabels = await page.locator(".patient-task-strip [role='tab']:visible").allTextContents();
    assert(followedTabLabels.join("|") === "Summary|Today|Context|Workup|Checklist|Findings|Evidence", `followed patient should show Today after continuity is saved, got ${followedTabLabels.join("|")}`);
    await clickPatientTab(page, "today");
    const followedTodayAudit = await page.evaluate(() => ({
      patientTab: document.body.dataset.patientTab,
      modeHelp: document.querySelector("#todayModeHelp")?.textContent || "",
      returningPressed: document.querySelector('[data-today-mode="returning"]')?.getAttribute("aria-pressed") || "",
      continuity: document.querySelector("#workspaceContinuityInput")?.value || ""
    }));
    assert(
      followedTodayAudit.patientTab === "today"
        && followedTodayAudit.returningPressed === "true"
        && /last 24 hours/i.test(followedTodayAudit.modeHelp),
      `followed patient Today tab should open in 24h update mode: ${JSON.stringify(followedTodayAudit)}`
    );
    await clickPatientTab(page, "overview");
  }
  const phoneTabAudit = await page.evaluate(() => {
    const tab = document.querySelector('[data-patient-tab="handoff"]');
    const rect = tab?.getBoundingClientRect();
    return {
      bodyDeviceMode: document.body.dataset.deviceMode,
      hidden: Boolean(tab?.hidden),
      ariaHidden: tab?.getAttribute("aria-hidden") || "",
      visible: Boolean(rect && rect.width > 0 && rect.height > 0 && getComputedStyle(tab).display !== "none")
    };
  });
  if (viewport.width < 760) {
    assert(!phoneTabAudit.hidden && !phoneTabAudit.visible && phoneTabAudit.bodyDeviceMode === "phone", `phone-sized workspace should keep the phone handoff tab available but out of the primary checklist UI: ${JSON.stringify(phoneTabAudit)}`);
  } else {
    assert(phoneTabAudit.hidden && phoneTabAudit.ariaHidden === "true" && !phoneTabAudit.visible && phoneTabAudit.bodyDeviceMode === "desktop", `desktop workspace should hide the phone handoff tab: ${JSON.stringify(phoneTabAudit)}`);
    await page.evaluate(() => document.querySelector('[data-patient-tab="handoff"]')?.click());
    await page.waitForFunction(() => document.body.dataset.patientTab === "checklist");
    const forcedPhoneTabAudit = await page.evaluate(() => ({
      bodyDeviceMode: document.body.dataset.deviceMode,
      patientTab: document.body.dataset.patientTab,
      phoneTabHidden: Boolean(document.querySelector('[data-patient-tab="handoff"]')?.hidden),
      phonePanelHidden: Boolean(document.querySelector('[data-patient-panel="handoff"]')?.hidden),
      admissionOverlayHidden: Boolean(document.querySelector("#patientAdmissionOverlay")?.hidden),
      visibleTabs: Array.from(document.querySelectorAll(".patient-task-strip [role='tab']"))
        .filter((tab) => !tab.hidden && getComputedStyle(tab).display !== "none")
        .map((tab) => tab.textContent?.trim() || "")
    }));
    assert(
      forcedPhoneTabAudit.bodyDeviceMode === "desktop"
        && forcedPhoneTabAudit.patientTab === "checklist"
        && forcedPhoneTabAudit.phoneTabHidden
        && forcedPhoneTabAudit.phonePanelHidden
        && forcedPhoneTabAudit.admissionOverlayHidden
        && !forcedPhoneTabAudit.visibleTabs.includes("Phone"),
      `desktop should coerce hidden Phone tab activation back to the checklist workflow: ${JSON.stringify(forcedPhoneTabAudit)}`
    );
    await clickPatientTab(page, "overview");
  }
  const patientTabLayout = await page.evaluate(() => {
    const strip = document.querySelector(".patient-task-strip");
    const tabs = Array.from(document.querySelectorAll(".patient-task-strip [role='tab']"))
      .filter((tab) => !tab.hidden && getComputedStyle(tab).display !== "none" && tab.getBoundingClientRect().width > 0);
    const rowTops = new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
    const clipped = tabs
      .filter((tab) => tab.scrollWidth > tab.clientWidth + 2 || tab.scrollHeight > tab.clientHeight + 2)
      .map((tab) => tab.textContent?.trim() || "");
    return {
      rowCount: rowTops.size,
      clipped,
      display: strip ? getComputedStyle(strip).display : "",
      scrollWidth: Math.round(strip?.scrollWidth || 0),
      clientWidth: Math.round(strip?.clientWidth || 0)
    };
  });
  if (viewport.width >= 760) {
    assert(patientTabLayout.rowCount === 1, `patient workflow tabs should stay in one navigable row on tablet/desktop: ${JSON.stringify(patientTabLayout)}`);
  } else {
    assert(patientTabLayout.rowCount === 0 && patientTabLayout.display === "none", `phone workspace should hide the distracting tab grid: ${JSON.stringify(patientTabLayout)}`);
  }
  assert(patientTabLayout.clipped.length === 0, `patient workflow tab labels should not be clipped: ${JSON.stringify(patientTabLayout)}`);
  const countLabel = await page.textContent("#patientCountLabel");
  assert(/1 active \/ 1 total/.test(countLabel), `patient count should reflect the admitted patient, got ${countLabel}`);

  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded" && document.activeElement?.id === "patientSearchInput");
  await assertRosterState(true, `expanded roster ${label}`);
  await page.fill("#patientSearchInput", "oxygen");
  let rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Room 12"), "patient roster search should match patient context and concern");
  await page.fill("#patientSearchInput", "not-present");
  rosterText = await page.textContent("#patientList");
  assert(/No patients match that search/.test(rosterText), "patient roster should show an empty search state");
  await page.fill("#patientSearchInput", "");
  rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Room 12"), "clearing patient search should restore the roster without freezing");
  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "collapsed");
  await assertRosterState(false, `collapsed roster after toggle ${label}`);
  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded" && document.activeElement?.id === "patientSearchInput");
  await assertRosterState(true, `re-expanded roster ${label}`);

  await clickPatientTab(page, "checklist");
  await assertRosterState(true, `checklist tab roster ${label}`);
  let checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button:visible').allTextContents();
  let checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  if (viewport.width < 760) {
    const phoneLauncherAudit = await page.evaluate(() => {
      const launcher = document.querySelector("#phoneChecklistLauncher");
      const tabs = document.querySelector(".patient-task-strip");
      const primary = document.querySelector("#phoneChecklistPrimaryButton");
      const results = Array.from(document.querySelectorAll("#phoneChecklistWorkupResults [data-module-id]")).map((row) => row.textContent || "");
      return {
        launcherVisible: Boolean(launcher && getComputedStyle(launcher).display !== "none" && launcher.getBoundingClientRect().height > 0),
        tabDisplay: tabs ? getComputedStyle(tabs).display : "",
        primaryText: primary?.textContent?.trim() || "",
        primaryDisabled: Boolean(primary?.disabled),
        workupTitle: document.querySelector("#phoneChecklistWorkupTitle")?.textContent?.trim() || "",
        status: document.querySelector("#phoneChecklistRefinementStatus")?.textContent?.trim() || "",
        resultCount: results.length
      };
    });
    assert(phoneLauncherAudit.launcherVisible && phoneLauncherAudit.tabDisplay === "none", `phone checklist launcher should replace the tab grid: ${JSON.stringify(phoneLauncherAudit)}`);
    assert(!phoneLauncherAudit.primaryDisabled && /Build|Open|modified/i.test(phoneLauncherAudit.primaryText), `phone checklist primary should be ready: ${JSON.stringify(phoneLauncherAudit)}`);
    assert(phoneLauncherAudit.resultCount >= 1, `phone launcher should show workup choices: ${JSON.stringify(phoneLauncherAudit)}`);
    assert(checklistPanelButtons.length === 0, `phone checklist panel should hide desktop command buttons, got ${checklistPanelButtons.join("|")}`);
    await page.fill("#phoneChecklistWorkupInput", "chest pain");
    await page.waitForSelector('#phoneChecklistWorkupResults [data-module-id]:has-text("Chest pain")');
    const phoneChestPainId = await page.locator('#phoneChecklistWorkupResults [data-module-id]:has-text("Chest pain")').first().getAttribute("data-module-id");
    assert(phoneChestPainId, "phone workup search should expose a selectable chest pain workup");
    await page.locator(`#phoneChecklistWorkupResults [data-module-id="${phoneChestPainId}"]`).first().click();
    await page.waitForFunction((moduleId) => document.querySelector("#patientWorkupSelect")?.value === moduleId, phoneChestPainId);
    const phoneSelectedAudit = await page.evaluate(() => ({
      patientTab: document.body.dataset.patientTab,
      selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
      phoneTitle: document.querySelector("#phoneChecklistWorkupTitle")?.textContent || "",
      status: document.querySelector("#phoneChecklistRefinementStatus")?.textContent || ""
    }));
    assert(phoneSelectedAudit.patientTab === "checklist" && /Chest pain/i.test(phoneSelectedAudit.phoneTitle), `phone workup selection should stay on the checklist launcher: ${JSON.stringify(phoneSelectedAudit)}`);
  } else {
    assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `unbuilt checklist panel should expose only build and workup-change paths, got ${checklistPanelButtons.join("|")}`);
    assert(checklistPrimaryEnabled, "checklist build primary should be enabled for the selected workup");
    await page.click("#workspaceChecklistSecondaryButton");
    await page.waitForFunction(() => document.querySelector('button[data-patient-tab="workup"]')?.getAttribute("aria-selected") === "true");
    await assertRosterState(true, `workup tab roster ${label}`);
    const focusedWorkupControl = await page.evaluate(() => document.activeElement?.id || "");
    assert(focusedWorkupControl === "patientWorkupConcernInput", `change-workup action should focus the workup search, got ${focusedWorkupControl}`);
  }

  await clickPatientTab(page, "findings");
  await assertRosterState(true, `findings tab roster ${label}`);
  const findingsGateText = await page.textContent("#workspaceFindingsGateNotice");
  assert(/Build the bedside checklist|Answer at least one bedside checklist/.test(findingsGateText), `findings tab should gate on checklist answers, got ${findingsGateText}`);
  const historyFindingsDisabled = await page.locator("#workspaceHistoryFindingInput").isDisabled();
  assert(historyFindingsDisabled, "findings input should be disabled before checklist-derived findings exist");

  await clickPatientTab(page, "evidence");
  await assertRosterState(true, `evidence tab roster ${label}`);
  const patientEvidenceTasks = await page.locator("#patientEvidenceTaskStrip .task-card").count();
  assert(patientEvidenceTasks >= 8, `OpenEvidence patient tab should render task cards, got ${patientEvidenceTasks}`);
  const patientEvidenceLayout = await page.evaluate(() => {
    const grid = document.querySelector(".patient-evidence-grid");
    const nav = document.querySelector(".patient-evidence-nav");
    const preview = document.querySelector(".patient-evidence-preview");
    const patientRail = document.querySelector(".patient-rail");
    const cards = Array.from(document.querySelectorAll("#patientEvidenceTaskStrip .task-card"));
    const clipped = cards.flatMap((card) => (
      Array.from(card.querySelectorAll("strong, span")).filter((node) => node.scrollWidth > node.clientWidth + 2)
        .map((node) => node.textContent?.trim() || "")
    ));
    const gridRect = grid?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect();
    return {
      patientTab: document.body.dataset.patientTab,
      gridWidth: Math.round(gridRect?.width || 0),
      navRight: Math.round(navRect?.right || 0),
      previewLeft: Math.round(previewRect?.left || 0),
      sideBySide: Boolean(navRect && previewRect && navRect.right <= previewRect.left + 2),
      patientRailDisplay: patientRail ? getComputedStyle(patientRail).display : "",
      contextRailPresent: Boolean(document.querySelector(".context-rail")),
      clipped
    };
  });
  assert(patientEvidenceLayout.patientTab === "evidence", `Evidence tab should mark layout state on body: ${JSON.stringify(patientEvidenceLayout)}`);
  assert(patientEvidenceLayout.patientRailDisplay !== "none", `Evidence tab should keep the expanded roster rail visible: ${JSON.stringify(patientEvidenceLayout)}`);
  assert(patientEvidenceLayout.contextRailPresent === false, `Evidence tab should not render the old status rail: ${JSON.stringify(patientEvidenceLayout)}`);
	  assert(patientEvidenceLayout.clipped.length === 0, `OpenEvidence task card text should wrap instead of clipping: ${JSON.stringify(patientEvidenceLayout)}`);
	  if (viewport.width >= 980) {
	    assert(patientEvidenceLayout.sideBySide, `OpenEvidence patient workbench should keep task list and preview side-by-side on usable widths: ${JSON.stringify(patientEvidenceLayout)}`);
	  }
	  const patientEvidenceActionLayout = await page.evaluate(() => {
	    const answer = document.querySelector(".patient-evidence-answer-panel");
	    const copy = document.querySelector("#copyPromptButton");
	    const apply = document.querySelector("#patientSaveDefaultEvidenceRefinementButton");
	    const prompt = document.querySelector("#patientEvidencePromptPreview");
	    const rectFor = (element) => {
	      const rect = element?.getBoundingClientRect();
	      return rect ? {
	        top: Math.round(rect.top),
	        bottom: Math.round(rect.bottom),
	        height: Math.round(rect.height),
	        width: Math.round(rect.width)
	      } : null;
	    };
	    const clippedActions = Array.from(document.querySelectorAll(".patient-evidence-answer-actions .btn"))
	      .filter((button) => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2)
	      .map((button) => button.textContent?.trim() || "");
	    return {
	      answer: rectFor(answer),
	      copy: rectFor(copy),
	      apply: rectFor(apply),
	      prompt: rectFor(prompt),
	      viewportHeight: window.innerHeight,
	      clippedActions
	    };
	  });
	  assert(patientEvidenceActionLayout.clippedActions.length === 0, `OpenEvidence answer actions should not clip labels: ${JSON.stringify(patientEvidenceActionLayout)}`);
	  if (viewport.width < 760) {
	    assert(patientEvidenceActionLayout.answer?.top < viewport.height * 0.5, `mobile Evidence should put paste/rebuild controls before the prompt list: ${JSON.stringify(patientEvidenceActionLayout)}`);
	    assert(patientEvidenceActionLayout.apply?.bottom < viewport.height, `mobile Evidence rebuild action should be visible without scrolling: ${JSON.stringify(patientEvidenceActionLayout)}`);
	  } else {
	    assert(patientEvidenceActionLayout.answer?.top <= (patientEvidenceActionLayout.prompt?.top || 0) + 4, `desktop Evidence answer panel should sit beside the prompt preview: ${JSON.stringify(patientEvidenceActionLayout)}`);
	  }
	  const patientPromptPreview = await page.inputValue("#patientEvidencePromptPreview");
  assert(/<task_boundary>/.test(patientPromptPreview) && /{{(?:source_context|deidentified_patient_context|current_checklist)}}/i.test(patientPromptPreview), "OpenEvidence patient tab should show an editable prompt template with variables");
  await page.fill("#patientEvidenceTaskSearchInput", "checklist");
  await page.waitForFunction(() => /of/.test(document.querySelector("#patientEvidenceTaskCount")?.textContent || ""));
  const filteredPatientEvidenceTasks = await page.locator("#patientEvidenceTaskStrip .task-card").count();
  const filteredPatientEvidenceLabels = await page.locator("#patientEvidenceTaskStrip .task-card").allTextContents();
  assert(filteredPatientEvidenceTasks >= 1 && filteredPatientEvidenceTasks < patientEvidenceTasks, `OpenEvidence task search should narrow the prompt list, got ${filteredPatientEvidenceTasks} from ${patientEvidenceTasks}`);
  assert(filteredPatientEvidenceLabels.some((text) => /checklist/i.test(text)), `OpenEvidence task search should expose checklist-related task, got ${filteredPatientEvidenceLabels.join(" | ")}`);
  await page.click("#clearPatientEvidenceTaskSearchButton");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("#patientEvidenceTaskStrip .task-card").length === expectedCount, patientEvidenceTasks);
  await page.fill("#patientEvidenceTaskSearchInput", "medication");
  await page.waitForFunction(() => /Medication safety/i.test(document.querySelector("#patientEvidencePromptPreview")?.value || ""));
  await page.click("#copyPromptButton");
  await page.waitForSelector("#phiOverlay:not([hidden])");
  const copiedPromptPreview = await page.textContent("#phiPreviewText");
  assert(/Medication safety|medication_safety|medication, dosing/i.test(copiedPromptPreview), "Copy prompt should respect the searched/selected OpenEvidence task");
  await page.click("#closePhiOverlayButton");
  await page.click("#clearPatientEvidenceTaskSearchButton");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("#patientEvidenceTaskStrip .task-card").length === expectedCount, patientEvidenceTasks);
  await page.click("#patientOpenEvidenceBoardButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace" && document.body.dataset.patientTab === "evidence" && document.querySelector("#sharedPromptWorkbench")?.dataset.mode === "full");
  await page.click("#patientOpenEvidenceBoardButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace" && document.body.dataset.patientTab === "evidence" && document.querySelector("#sharedPromptWorkbench")?.dataset.mode !== "full");

  await clickPatientTab(page, "workup");
  await showPatientWorkupsPane(page);
  await page.fill("#patientWorkupConcernInput", "chest pain");
  await page.waitForSelector('#patientWorkupResults [data-module-id]:has-text("Chest pain")');
  const chestPainId = await page.locator('#patientWorkupResults [data-module-id]:has-text("Chest pain")').first().getAttribute("data-module-id");
  assert(chestPainId, "workup search should expose a selectable chest pain workup result");
  await page.locator(`#patientWorkupResults [data-module-id="${chestPainId}"]`).first().click();
  await page.waitForFunction((moduleId) => document.querySelector("#patientWorkupSelect")?.value === moduleId, chestPainId);
  const selectedLabel = await page.textContent("#patientValidatedIntentLabel");
  assert(/chest pain/i.test(selectedLabel), `selecting a workup result should update the patient workup, got ${selectedLabel}`);
  await showPatientPathwayPane(page);
  await page.waitForFunction(() => document.querySelector("#patientDecisionTreePanel")?._cytoscape?.nodes?.().length > 0);
  const patientTreeAudit = await page.evaluate(() => {
    const cy = document.querySelector("#patientDecisionTreePanel")?._cytoscape;
    const fontSizes = cy ? cy.nodes().map((node) => Number.parseFloat(String(node.style("font-size") || "0"))) : [];
    const dataInsufficientEdges = cy ? cy.edges().filter((edge) => /data insufficient/i.test(String(edge.data("label") || ""))).length : 0;
    return {
      cytoscapeReady: Boolean(cy && cy.nodes().length),
      floatingToolbars: document.querySelectorAll("#patientDecisionTreePanel .cytoscape-tree-toolbar").length,
      topFitButtons: document.querySelectorAll("#fitDecisionTreeButton").length,
      topZoomInButtons: document.querySelectorAll("#zoomInDecisionTreeButton").length,
      topZoomOutButtons: document.querySelectorAll("#zoomOutDecisionTreeButton").length,
      minFontSize: fontSizes.length ? Math.min(...fontSizes) : 0,
      dataInsufficientEdges
    };
  });
  assert(patientTreeAudit.cytoscapeReady, `patient tree should render through Cytoscape: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.floatingToolbars === 0, `patient tree should not duplicate the top zoom toolbar: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.topFitButtons === 1, `patient tree should have one fit button: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.topZoomInButtons === 1, `patient tree should have one zoom-in button: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.topZoomOutButtons === 1, `patient tree should have one zoom-out button: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.minFontSize >= 15, `patient tree node text should be readable by default: ${JSON.stringify(patientTreeAudit)}`);
  assert(patientTreeAudit.dataInsufficientEdges <= 1, `patient tree should collapse repeated data-insufficient branches: ${JSON.stringify(patientTreeAudit)}`);
  await page.click("#decisionTreeHighlightPathToggle");
  await page.waitForFunction(() => document.querySelector("#decisionTreeHighlightPathToggle")?.getAttribute("aria-pressed") === "false");
  const highlightOffAudit = await page.evaluate(() => {
    const cy = document.querySelector("#patientDecisionTreePanel")?._cytoscape;
    return {
      ariaPressed: document.querySelector("#decisionTreeHighlightPathToggle")?.getAttribute("aria-pressed"),
      allHighlightOff: cy ? cy.elements().every((entry) => entry.data("highlightActivePath") === "no") : false
    };
  });
  assert(highlightOffAudit.allHighlightOff, `highlight toggle should turn active-path styling off: ${JSON.stringify(highlightOffAudit)}`);
  await page.click("#decisionTreeHighlightPathToggle");
  await page.waitForFunction(() => document.querySelector("#decisionTreeHighlightPathToggle")?.getAttribute("aria-pressed") === "true");

  await clickPatientTab(page, "checklist");
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button:visible').allTextContents();
  checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  if (viewport.width < 760) {
    assert(checklistPanelButtons.length === 0, `phone selected-workup checklist panel should keep desktop commands hidden, got ${checklistPanelButtons.join("|")}`);
    const phoneSelectedLauncher = await page.evaluate(() => ({
      title: document.querySelector("#phoneChecklistWorkupTitle")?.textContent?.trim() || "",
      primary: document.querySelector("#phoneChecklistPrimaryButton")?.textContent?.trim() || "",
      disabled: document.querySelector("#phoneChecklistPrimaryButton")?.disabled || false,
      status: document.querySelector("#phoneChecklistRefinementStatus")?.textContent?.trim() || ""
    }));
    assert(/chest pain/i.test(phoneSelectedLauncher.title) && !phoneSelectedLauncher.disabled, `phone checklist launcher should keep the selected chest-pain workup ready: ${JSON.stringify(phoneSelectedLauncher)}`);
    await page.click("#phoneChecklistPrimaryButton");
  } else {
    assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `selected-workup checklist panel should show only build/change actions, got ${checklistPanelButtons.join("|")}`);
    assert(checklistPrimaryEnabled, "checklist build primary should be enabled after selecting a validated workup");
    await page.click("#workspaceOpenBedsideChecklistButton");
  }
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button:visible').allTextContents();
  if (viewport.width < 760) {
    const builtPhoneLauncher = await page.evaluate(() => ({
      view: document.body.dataset.view,
      primary: document.querySelector("#phoneChecklistPrimaryButton")?.textContent?.trim() || "",
      buttonCount: Array.from(document.querySelectorAll('#patientChecklistPanel .checklist-command-grid button'))
        .filter((button) => getComputedStyle(button).display !== "none" && button.getBoundingClientRect().height > 0).length
    }));
    assert(builtPhoneLauncher.view === "bedside" || /Open/i.test(builtPhoneLauncher.primary), `phone primary should build directly into the bedside checklist: ${JSON.stringify(builtPhoneLauncher)}`);
    if (builtPhoneLauncher.view === "bedside") {
      await page.click("#bedsideMobileMenuButton");
      await page.waitForSelector("#workspaceView:not([hidden])");
      await clickPatientTab(page, "checklist");
    }
    assert(builtPhoneLauncher.buttonCount === 0, `phone built checklist panel should keep desktop commands hidden: ${JSON.stringify(builtPhoneLauncher)}`);
  } else {
    assert(checklistPanelButtons.join("|") === "Answer bedside checklist|Send checklist to phone", `built checklist panel should switch to answer/phone actions without a redundant rebuild button, got ${checklistPanelButtons.join("|")}`);
  }
  const checklistDirectoryAudit = await page.evaluate(() => {
    const directory = document.querySelector("#workspaceChecklistDirectory");
    const buttons = Array.from(document.querySelectorAll("#workspaceChecklistDirectory .workspace-checklist-jump"));
    const clipped = buttons.flatMap((button) => (
      Array.from(button.querySelectorAll("strong, .jump-hint, .question-number"))
        .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
        .map((node) => node.textContent?.trim() || "")
    ));
    return {
      hidden: !directory || directory.hidden,
      sections: document.querySelectorAll("#workspaceChecklistDirectory .workspace-checklist-section").length,
      buttons: buttons.length,
      clipped
    };
  });
  assert(!checklistDirectoryAudit.hidden, `built checklist tab should show an all-question directory: ${JSON.stringify(checklistDirectoryAudit)}`);
  assert(checklistDirectoryAudit.sections >= 1 && checklistDirectoryAudit.buttons >= 8, `checklist directory should expose the full built checklist, not a tiny preview: ${JSON.stringify(checklistDirectoryAudit)}`);
  assert(checklistDirectoryAudit.clipped.length === 0, `checklist directory rows should not clip labels: ${JSON.stringify(checklistDirectoryAudit)}`);

  await page.waitForSelector("#patientChecklistEditor:not([hidden])");
  await page.selectOption("#patientChecklistEditTypeSelect", "history");
  await page.fill("#patientChecklistEditTextInput", "Any new exertional chest pressure since arrival?");
  await page.fill("#patientChecklistEditOptionsInput", "No / Yes / Unclear / Other ___");
  await page.click("#addPatientChecklistItemButton");
  await page.waitForFunction(() => /new exertional chest pressure/i.test(document.querySelector("#workspaceChecklistDirectory")?.textContent || ""));
  await page.selectOption("#patientChecklistEditTypeSelect", "exam");
  await page.fill("#patientChecklistEditTextInput", "Check reproducible chest wall tenderness");
  await page.fill("#patientChecklistEditOptionsInput", "Absent / Present / Unable to assess");
  await page.click("#addPatientChecklistItemButton");
  await page.waitForFunction(() => /reproducible chest wall tenderness/i.test(document.querySelector("#workspaceChecklistDirectory")?.textContent || ""));
  await page.fill("#patientChecklistEditTextInput", "Check reproducible chest wall tenderness and focal rash");
  await page.click("#savePatientChecklistItemButton");
  await page.waitForFunction(() => /focal rash/i.test(document.querySelector("#workspaceChecklistDirectory")?.textContent || ""));
  await page.click("#removePatientChecklistItemButton");
  await page.waitForFunction(() => {
    const text = document.querySelector("#workspaceChecklistDirectory")?.textContent || "";
    return /new exertional chest pressure/i.test(text) && !/focal rash/i.test(text);
  });
  await page.selectOption("#patientChecklistPatchSectionSelect", "physical_exam");
  await page.click("#copyPatientChecklistPatchPromptButton");
  await page.waitForSelector("#phiOverlay:not([hidden])");
  const checklistPatchPromptPreview = await page.textContent("#phiPreviewText");
  assert(/workup_section_patch_v1/.test(checklistPatchPromptPreview) && /physical_exam/.test(checklistPatchPromptPreview) && /itemId/.test(checklistPatchPromptPreview), "patient checklist patch prompt should expose schema, target section, and exact row IDs");
  await page.click("#closePhiOverlayButton");
  const examPatchAdd = {
    schema: "workup_section_patch_v1",
    workupId: chestPainId,
    sectionKey: "physical_exam",
    summary: "Add a patient-specific volume exam row.",
    operations: [
      {
        op: "add",
        groupKey: "conditionalExam",
        item: {
          id: "patient_specific_jvp_patch",
          item_type: "physical_exam_maneuver",
          label: "Assess JVP with patient at 45 degrees",
          technique: "Assess JVP with patient at 45 degrees",
          answerMode: "single",
          options: ["Not elevated", "Elevated", "Unable to assess"],
          normalAnswers: ["Not elevated"],
          rationale: "Clarifies volume status for this patient."
        }
      }
    ]
  };
  await page.fill("#patientChecklistPatchInput", JSON.stringify(examPatchAdd, null, 2));
  await page.waitForFunction(() => /patch ready/i.test(document.querySelector("#patientChecklistPatchPreview")?.textContent || ""));
  await page.click("#applyPatientChecklistPatchButton");
  await page.waitForFunction(() => /Assess JVP with patient at 45 degrees/i.test(document.querySelector("#workspaceChecklistDirectory")?.textContent || ""));
  const examPatchUpdate = {
    schema: "workup_section_patch_v1",
    workupId: chestPainId,
    sectionKey: "physical_exam",
    summary: "Refine the patient-specific volume exam row.",
    operations: [
      {
        op: "update",
        itemId: "patient_specific_jvp_patch",
        label: "Assess JVP and hepatojugular reflux",
        technique: "Assess JVP and hepatojugular reflux",
        options: ["Not elevated", "Elevated JVP", "Positive hepatojugular reflux", "Unable to assess"],
        normalAnswers: ["Not elevated"]
      }
    ]
  };
  await page.fill("#patientChecklistPatchInput", JSON.stringify(examPatchUpdate, null, 2));
  await page.waitForFunction(() => /patch ready/i.test(document.querySelector("#patientChecklistPatchPreview")?.textContent || ""));
  await page.click("#applyPatientChecklistPatchButton");
  await page.waitForFunction(() => /hepatojugular reflux/i.test(document.querySelector("#workspaceChecklistDirectory")?.textContent || ""));
  const examPatchRemove = {
    schema: "workup_section_patch_v1",
    workupId: chestPainId,
    sectionKey: "physical_exam",
    summary: "Remove the patient-specific volume exam row.",
    operations: [
      { op: "remove", itemId: "patient_specific_jvp_patch" }
    ]
  };
  await page.fill("#patientChecklistPatchInput", JSON.stringify(examPatchRemove, null, 2));
  await page.waitForFunction(() => /patch ready/i.test(document.querySelector("#patientChecklistPatchPreview")?.textContent || ""));
  await page.click("#applyPatientChecklistPatchButton");
  await page.waitForFunction(() => {
    const text = document.querySelector("#workspaceChecklistDirectory")?.textContent || "";
    return /new exertional chest pressure/i.test(text) && !/hepatojugular reflux/i.test(text);
  });

  await page.locator("#workspaceChecklistDirectory .workspace-checklist-jump").first().click();
  await page.waitForSelector("#bedsideView:not([hidden])");
  await page.waitForFunction(() => document.querySelector(".checklist-row.is-active")?.getBoundingClientRect().height > 0);
  await page.click(viewport.width < 760 ? "#bedsideMobileMenuButton" : "#bedsideHeaderSettingsButton");
  await page.waitForSelector("#workspaceView:not([hidden])");
  await clickPatientTab(page, "checklist");
  await page.waitForFunction(() => document.body.dataset.patientTab === "checklist");

  if (viewport.width < 760) {
    await clickPatientTab(page, "handoff");
    await page.waitForSelector("#patientPhonePanel:not([hidden])");
    await page.click("#workspaceHandoffButton");
    await page.waitForFunction(() => {
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      return visible("#handoffView") || visible("#patientFindingsPanel");
    });
  } else {
    await page.click("#workspaceChecklistPhoneButton");
    await page.waitForSelector("#workspaceView:not([hidden])");
    await page.waitForFunction(() => document.body.dataset.patientTab === "findings");
    await page.waitForSelector("#patientFindingsPanel:not([hidden])");
  }
  await page.waitForFunction(() => document.querySelector("#phonePayload")?.value.length > 100);
  const phoneCode = await page.textContent("#phoneTransferCode");
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(phoneCode.trim()), `phone handoff should generate a pairing code, got ${phoneCode}`);

  await clickPatientRosterToggle(page);
  await page.waitForSelector("#workspaceView:not([hidden])");
  const dischargeSelector = viewport.width < 760
    ? '#patientList .patient-card-actions button:has-text("Discharge")'
    : "#dischargePatientButton";
  await page.click(dischargeSelector);
  await page.waitForSelector("#dischargeConfirmOverlay:not([hidden])");
  const pendingDischargeCopy = await page.textContent("#dischargeConfirmCopy");
  assert(pendingDischargeCopy.includes(patientLabel), `discharge confirmation should name the patient, got ${pendingDischargeCopy}`);
  await page.click("#cancelDischargeButton");
  await page.waitForFunction(() => document.querySelector("#dischargeConfirmOverlay")?.hidden === true);
  rosterText = await page.textContent("#patientList");
  assert(rosterText.includes(patientLabel), "canceling discharge should keep the patient in the roster");
  await page.click(dischargeSelector);
  await page.waitForSelector("#dischargeConfirmOverlay:not([hidden])");
  await page.click("#confirmDischargeButton");
  await page.waitForFunction((patient) => !(document.querySelector("#patientList")?.textContent || "").includes(patient), patientLabel);
  rosterText = await page.textContent("#patientList");
  assert(/No patients in this vault yet/.test(rosterText), `confirmed discharge should remove the patient, got ${rosterText}`);

  await waitForEncryptedSave(page);
  const snapshot = await storageSnapshot(page);
  assert(snapshot[vaultMetaKey] && snapshot[vaultDataKey], "vault mode should persist only vault metadata and encrypted data");
  const storageText = joinedStorage(snapshot);
  assert(!storageText.includes("Room 12") && !storageText.includes("oxygen requirement"), "patient details should not appear in localStorage plaintext");
  await page.click("#lockVaultButton");
  await page.waitForFunction(() => document.body.dataset.view === "vaultAccess");
  const lockedVaultEntryAudit = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return !element.hidden && getComputedStyle(element).display !== "none" && rect.width > 0 && rect.height > 0;
    };
    return {
      openVaultVisible: visible("#openVaultSection"),
      createVaultVisible: visible("#createVaultSection"),
      phoneEntryVisible: visible("#phoneBundleEntrySection")
    };
  });
  assert(lockedVaultEntryAudit.openVaultVisible && !lockedVaultEntryAudit.createVaultVisible && !lockedVaultEntryAudit.phoneEntryVisible, `desktop entry with an existing vault should offer open-vault only: ${JSON.stringify(lockedVaultEntryAudit)}`);
  await context.close();
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await testDemoCaseLoader(browser, baseUrl);
  await testSinglePatientBypass(browser, baseUrl);
  await testPhoneManualFallbackHome(browser, baseUrl);
  await testPhoneBundleRoundTrip(browser, baseUrl);
  for (const viewport of [
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
