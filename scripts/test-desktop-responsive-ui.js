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

async function openFreshPage(browser, baseUrl, viewport) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
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
  assert(Object.keys(snapshot).length === 0, `demo case should not write localStorage, got ${Object.keys(snapshot).join(", ")}`);
  const demoAudit = await page.evaluate(() => ({
    title: document.querySelector("#caseTitle")?.textContent?.trim() || "",
    workspaceTitle: document.querySelector("#patientWorkspaceTitle")?.textContent?.trim() || "",
    oneLine: document.querySelector("#patientWorkspaceOneLine")?.textContent?.trim() || "",
    admission: document.querySelector("#workspaceAdmissionInput")?.value || "",
    labs: document.querySelector("#workspaceLabsMedsInput")?.value || "",
    workupValue: document.querySelector("#patientWorkupSelect")?.value || "",
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false,
    status: document.querySelector("#statusLive")?.textContent?.trim() || ""
  }));
  assert(demoAudit.title.includes("Demo - DKA consult"), `demo should select the synthetic patient: ${JSON.stringify(demoAudit)}`);
  assert(/Synthetic adult case - no saved data/i.test(demoAudit.oneLine), `demo one-line copy should identify no-save synthetic data: ${JSON.stringify(demoAudit)}`);
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
  await clickPatientRosterToggle(page);
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded" && document.activeElement?.id === "patientSearchInput");
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
  await desktopPage.waitForSelector("#handoffView:not([hidden])");
  await desktopPage.waitForFunction(() => document.querySelector("#phonePayload")?.value.length > 100);
  const desktopPayload = await desktopPage.inputValue("#phonePayload");
  const desktopCode = (await desktopPage.textContent("#phoneTransferCode")).trim();
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(desktopCode), `desktop handoff should generate a pairing code, got ${desktopCode}`);

  const { context: phoneContext, page: phonePage } = await openFreshPage(browser, baseUrl, { width: 390, height: 844 });
  await assertNoLayoutBreakage(phonePage, "phone bundle vault entry");
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
  assert(phoneLoadedAudit.storageKeys.length === 0, `phone bundle session should not persist localStorage: ${JSON.stringify(phoneLoadedAudit)}`);

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
  await phonePage.click("#copyPhoneReturnPayloadButton");
  await phonePage.waitForSelector("#phiOverlay:not([hidden])");
  await phonePage.click("#confirmPhiActionButton");
  await phonePage.waitForFunction(() => document.querySelector("#phiOverlay")?.hidden === true);
  const returnPayload = await phonePage.evaluate(async () => navigator.clipboard.readText());
  assert(returnPayload.length > 100, "phone return payload should copy to clipboard after PHI review");
  let phoneSnapshot = await storageSnapshot(phonePage);
  assert(Object.keys(phoneSnapshot).length === 0, `phone interview should remain no-save after answers, got ${Object.keys(phoneSnapshot).join(", ")}`);
  await phoneContext.close();

  await desktopPage.fill("#phoneImportInput", returnPayload);
  await desktopPage.click("#importPhoneFindingsButton");
  await desktopPage.waitForFunction(() => /Phone checklist answers imported/i.test(document.querySelector("#handoffStatus")?.textContent || ""));
  await desktopPage.waitForFunction(() => /Imported phone findings:[\s\S]+:/i.test(document.querySelector("#finalUpdatePreview")?.textContent || ""));
  const desktopImportAudit = await desktopPage.evaluate(() => ({
    handoffStatus: document.querySelector("#handoffStatus")?.textContent?.trim() || "",
    finalText: document.querySelector("#finalUpdatePreview")?.textContent || "",
    answeredRows: document.querySelectorAll(".checklist-row.is-answered").length
  }));
  assert(desktopImportAudit.answeredRows >= 1, `desktop import should merge answered checklist rows: ${JSON.stringify(desktopImportAudit)}`);
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
    await page.click("#layoutNavCollapseButton");
    await page.waitForFunction(() => document.body.dataset.navCollapsed === "true");
    const collapsedNavAudit = await page.evaluate(() => ({
      sidebarVisible: Boolean(document.querySelector(".sidebar")?.offsetParent),
      sidebarWidth: Math.round(document.querySelector(".sidebar")?.getBoundingClientRect().width || 0),
      navTextHidden: Array.from(document.querySelectorAll(".sidebar .nav-button > span:not(.icon-box)")).every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width <= 1 && rect.height <= 1;
      }),
      floatVisible: (() => {
        const button = document.querySelector("#layoutNavFloatButton");
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })(),
      shellColumns: getComputedStyle(document.querySelector("#appShell")).gridTemplateColumns
    }));
    assert(collapsedNavAudit.sidebarVisible === true && collapsedNavAudit.sidebarWidth <= 70 && collapsedNavAudit.navTextHidden && collapsedNavAudit.floatVisible === false, `primary navigation should collapse to an in-layout rail without a floating button: ${JSON.stringify(collapsedNavAudit)}`);
    await page.click("#layoutNavCollapseButton");
    await page.waitForFunction(() => document.body.dataset.navCollapsed === "false");
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
    assert(resizedNavAudit.width > startSidebarWidth && resizedNavAudit.storedWidth >= resizedNavAudit.width - 2 && resizedNavAudit.collapsed === false, `primary navigation width should resize and persist: ${JSON.stringify({ startSidebarWidth, resizedNavAudit })}`);
  }
  await assertRosterState(false, `default collapsed roster ${label}`);
  const tabLabels = await page.locator(".patient-task-strip [role='tab']:visible").allTextContents();
  const expectedTabLabels = viewport.width < 760
    ? "Summary|Today|Context|Workup|Checklist|Findings|Evidence|Phone"
    : "Summary|Today|Context|Workup|Checklist|Findings|Evidence";
  assert(tabLabels.join("|") === expectedTabLabels, `patient tabs should match device workflow order, got ${tabLabels.join("|")}`);
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
    assert(phoneTabAudit.visible && phoneTabAudit.bodyDeviceMode === "phone", `phone-sized workspace should expose the phone handoff tab: ${JSON.stringify(phoneTabAudit)}`);
  } else {
    assert(phoneTabAudit.hidden && phoneTabAudit.ariaHidden === "true" && !phoneTabAudit.visible && phoneTabAudit.bodyDeviceMode === "desktop", `desktop workspace should hide the phone handoff tab: ${JSON.stringify(phoneTabAudit)}`);
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
      scrollWidth: Math.round(strip?.scrollWidth || 0),
      clientWidth: Math.round(strip?.clientWidth || 0)
    };
  });
  if (viewport.width >= 760) {
    assert(patientTabLayout.rowCount === 1, `patient workflow tabs should stay in one navigable row on tablet/desktop: ${JSON.stringify(patientTabLayout)}`);
  } else {
    assert(patientTabLayout.rowCount <= 2, `patient workflow tabs should stay visible in a compact phone grid: ${JSON.stringify(patientTabLayout)}`);
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
  assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `unbuilt checklist panel should expose only build and workup-change paths, got ${checklistPanelButtons.join("|")}`);
  let checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  assert(checklistPrimaryEnabled, "checklist build primary should be enabled for the selected workup");
  await page.click("#workspaceChecklistSecondaryButton");
  await page.waitForFunction(() => document.querySelector('button[data-patient-tab="workup"]')?.getAttribute("aria-selected") === "true");
  await assertRosterState(true, `workup tab roster ${label}`);
  const focusedWorkupControl = await page.evaluate(() => document.activeElement?.id || "");
  assert(focusedWorkupControl === "patientWorkupConcernInput", `change-workup action should focus the workup search, got ${focusedWorkupControl}`);

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

  await clickPatientTab(page, "checklist");
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button:visible').allTextContents();
  assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `selected-workup checklist panel should show only build/change actions, got ${checklistPanelButtons.join("|")}`);
  checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  assert(checklistPrimaryEnabled, "checklist build primary should be enabled after selecting a validated workup");
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button:visible').allTextContents();
  assert(checklistPanelButtons.join("|") === "Answer bedside checklist|Send checklist to phone", `built checklist panel should switch to answer/phone actions without a redundant rebuild button, got ${checklistPanelButtons.join("|")}`);
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
  } else {
    await page.click("#workspaceChecklistPhoneButton");
  }
  await page.waitForSelector("#handoffView:not([hidden])");
  await page.waitForFunction(() => document.querySelector("#phonePayload")?.value.length > 100);
  const phoneCode = await page.textContent("#phoneTransferCode");
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(phoneCode.trim()), `phone handoff should generate a pairing code, got ${phoneCode}`);

  await clickPatientRosterToggle(page);
  await page.waitForSelector("#workspaceView:not([hidden])");
  await page.click("#dischargePatientButton");
  await page.waitForSelector("#dischargeConfirmOverlay:not([hidden])");
  const pendingDischargeCopy = await page.textContent("#dischargeConfirmCopy");
  assert(pendingDischargeCopy.includes(patientLabel), `discharge confirmation should name the patient, got ${pendingDischargeCopy}`);
  await page.click("#cancelDischargeButton");
  await page.waitForFunction(() => document.querySelector("#dischargeConfirmOverlay")?.hidden === true);
  rosterText = await page.textContent("#patientList");
  assert(rosterText.includes(patientLabel), "canceling discharge should keep the patient in the roster");
  await page.click("#dischargePatientButton");
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
  await context.close();
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await testDemoCaseLoader(browser, baseUrl);
  await testSinglePatientBypass(browser, baseUrl);
  await testPhoneBundleRoundTrip(browser, baseUrl);
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
