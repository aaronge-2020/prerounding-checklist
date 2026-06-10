import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);
const browserDiagnostics = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const filePath = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
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

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const rootElement = document.scrollingElement || document.documentElement;
    return rootElement.scrollWidth - document.documentElement.clientWidth;
  });
  assert(overflow <= 2, `${label}: horizontal overflow ${overflow}px`);
}

async function clickChecklistChipByValue(page, question, value) {
  await page.evaluate(({ question, value }) => {
    const row = Array.from(document.querySelectorAll(".checklist-row"))
      .find((candidate) => candidate.querySelector(".checklist-question")?.textContent?.trim() === question);
    const button = row
      ? Array.from(row.querySelectorAll(".answer-chip")).find((candidate) => candidate.dataset.answerValue === value)
      : null;
    if (!button) throw new Error(`Missing checklist answer chip for ${question}: ${value}`);
    button.click();
  }, { question, value });
}

async function unlockVaultIfNeeded(page, password) {
  const atVaultGate = await page.locator("#vaultAccessView").isVisible({ timeout: 1000 }).catch(() => false);
  if (!atVaultGate) return;
  await page.fill("#vaultPasswordInput", password);
  await page.click("#openVaultButton");
  try {
    await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess", null, { timeout: 5000 });
  } catch (error) {
    const audit = await page.evaluate(() => ({
      bodyView: document.body.dataset.view,
      openVaultStatus: document.querySelector("#openVaultStatus")?.textContent?.trim() || "",
      hasVaultMeta: Boolean(localStorage.getItem("prerounding-local-vault-meta-v2")),
      hasVaultData: Boolean(localStorage.getItem("prerounding-local-vault-data-v1")),
      visibleText: document.body.innerText.slice(0, 600)
    }));
    throw new Error(`Unable to unlock clinical UI test vault: ${JSON.stringify({ ...audit, diagnostics: browserDiagnostics.slice(-8) })}`);
  }
}

async function admitSyntheticPatient(page, patient) {
  const overlayOpen = await page.locator("#patientAdmissionOverlay:not([hidden])").isVisible({ timeout: 500 }).catch(() => false);
  if (!overlayOpen) {
    await page.evaluate(() => document.querySelector("#sidebarAdmitPatientButton")?.click());
    await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  }
  await page.fill("#admitPatientLabelInput", patient.title);
  await page.fill("#admitPatientConcernInput", patient.concern);
  await page.fill("#admitPatientMetaInput", patient.meta || "");
  await page.fill("#admitPatientHistoryInput", patient.history || "");
  await page.fill("#admitPatientVitalsInput", patient.vitals || "");
  await page.fill("#admitPatientLabsInput", patient.labs || "");
  await page.click("#saveAdmittedPatientButton");
  await page.waitForFunction(() => document.querySelector("#patientAdmissionOverlay")?.hidden === true);
  await page.waitForFunction((title) => document.querySelector("#caseTitle")?.textContent?.includes(title), patient.title);
}

async function selectPatientByTitle(page, title) {
  await page.locator(".patient-card", { hasText: title }).first().click();
  await page.waitForFunction((expectedTitle) => document.querySelector("#caseTitle")?.textContent?.includes(expectedTitle), title);
}

async function createVaultWithSyntheticPatients(page, baseUrl, password) {
  await page.goto(`${baseUrl}/index.html?setupClinicalUiVault=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html?setupClinicalUiVault=${Date.now()}`);
  await page.fill("#newVaultNameInput", "Clinical UI test vault");
  await page.fill("#newVaultPasswordInput", password);
  await page.fill("#confirmVaultPasswordInput", password);
  await page.click("#createVaultButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  const patients = [
    {
      title: "Case A - DKA consult",
      concern: "DKA with vomiting and poor intake",
      meta: "Adult - endocrine consult",
      history: "Adult inpatient with DKA concern, vomiting, poor oral intake, abdominal discomfort, thirst, polyuria, and insulin transition planning.",
      vitals: "Improving tachycardia; room air; needs volume and mental status reassessment.",
      labs: "Glucose improving; anion gap closing; potassium trend pending; insulin supplies and sick-day plan need confirmation."
    },
    {
      title: "Case C - CHF exacerbation",
      concern: "CHF exacerbation with dyspnea, orthopnea, edema, palpitations, and neurologic symptom screen",
      meta: "Adult - cardiology floor",
      history: "Admitted for heart failure or volume overload with dyspnea, orthopnea, leg swelling, palpitations, and dizziness risk.",
      vitals: "On nasal cannula overnight; needs work of breathing, JVP, lung, edema, perfusion, and mobility reassessment.",
      labs: "Diuresis underway; renal function and electrolytes being trended."
    },
    {
      title: "Case B - Pneumonia",
      concern: "Pneumonia with fever, cough, sputum, dyspnea, and sepsis source review",
      meta: "Adult - medicine ward",
      history: "Admitted with pneumonia concern, fever, cough, sputum, pleuritic discomfort, oxygen need, and antimicrobial review.",
      vitals: "Febrile overnight; oxygen requirement improving but still present.",
      labs: "Leukocytosis; blood cultures pending; antibiotics started."
    },
    {
      title: "Case H - Chest pain",
      concern: "AKI without exact local workup",
      meta: "Adult - observation",
      history: "Unsupported AKI concern for picker fallback checks, with intermittent chest pressure available for manual chest-pain workup selection.",
      vitals: "Hemodynamically stable.",
      labs: "Troponin trend and ECG review pending."
    }
  ];
  for (const patient of patients) {
    await admitSyntheticPatient(page, patient);
  }
  await selectPatientByTitle(page, "Case A - DKA consult");
  await page.waitForFunction(() => Boolean(localStorage.getItem("prerounding-local-vault-data-v1")));
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  page.on("pageerror", (error) => browserDiagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserDiagnostics.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  const vaultPassword = "codex-clinical-ui-test";
  await createVaultWithSyntheticPatients(page, baseUrl, vaultPassword);
  await page.goto(`${baseUrl}/index.html?codexLiveWorkup=${Date.now()}`);
  await unlockVaultIfNeeded(page, vaultPassword);
  await page.waitForSelector("#workupView:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll(".workup-row").length >= 6);

  const rowTexts = await page.locator(".workup-row").allTextContents();
  assert(rowTexts.some((text) => text.includes("Prioritized bedside questions")), "clinical workup should render compact section rows");
  assert(!rowTexts.some((text) => /\?Prioritized|checksImmediate|flagsUrgent/.test(text)), "clinical workup rows should not concatenate raw generated detail");

  const modifiers = await page.locator(".modifier-chip").allTextContents();
  assert(modifiers.includes("Vomiting") && modifiers.includes("Poor intake"), "clinical modifiers should be individually labeled");
  const pressedCount = await page.locator('.modifier-chip[aria-pressed="true"]').count();
  assert(pressedCount >= 2, "DKA workup should keep selected Vomiting and Poor intake modifiers");

  await page.click("#standaloneDeidButton");
  await page.fill("#quickDeidInput", "Jane Doe MRN 123456 was admitted 6/8/2026 for DKA. Phone 555-111-2222.");
  await page.click("#quickDeidRunButton");
  const quickPreview = await page.textContent("#quickDeidPreview");
  assert(quickPreview.includes("[PATIENT NAME]") && quickPreview.includes("[MRN]"), "standalone de-ID should redact structured identifiers");
  await page.click("#quickDeidCopyButton");
  await page.waitForSelector("#phiOverlay:not([hidden])");
  await page.click("#closePhiOverlayButton");
  await page.click("#closeQuickDeidButton");

  await page.click("#buildChecklistButton");
  await page.waitForSelector("#handoffView:not([hidden])");
  await page.click("#useLaptopChecklistButton");
  await page.waitForSelector("#bedsideView:not([hidden])");
  await page.waitForSelector(".checklist-row .answer-chip");
  const firstQuestionControls = await page.locator(".checklist-row").first().locator(".answer-chip").allTextContents();
  assert(firstQuestionControls.length >= 3, `checklist rows should expose item-specific answer choices, got ${firstQuestionControls.join(", ")}`);
  assert(!(firstQuestionControls.length === 2 && firstQuestionControls.join("|") === "(-) No|(+) Yes"), "checklist rows should not collapse to generic Yes/No controls");
  await page.waitForSelector(".endorsement-row .endorsement-button");
  const firstEndorsementButtons = await page.locator(".endorsement-row").first().locator(".endorsement-button").allTextContents();
  assert(firstEndorsementButtons.join("|") === "(-) No|(+) Yes", `symptom rows should expose labeled -/+ endorsement buttons, got ${firstEndorsementButtons.join("|")}`);
  await page.locator(".endorsement-row").first().locator('.endorsement-button[data-status="positive"]').click();
  const pressedEndorsements = await page.locator('.endorsement-button[aria-pressed="true"]').count();
  assert(pressedEndorsements >= 1, "symptom endorsement controls should record a selected endorsement");
  const firstEndorsementPayload = await page.locator('.checklist-row[data-input-mode="endorsement"]').first().getAttribute("data-answer-payload");
  assert(/endorses/i.test(firstEndorsementPayload || ""), `endorsement answer payload should store explicit endorses text, got ${firstEndorsementPayload}`);
  const rowNoteCount = await page.locator(".checklist-row .item-note-input").count();
  const rowCount = await page.locator(".checklist-row").count();
  assert(rowNoteCount === rowCount, `each checklist row should have a note field, got ${rowNoteCount} notes for ${rowCount} rows`);
  const firstChecklistRow = page.locator(".checklist-row").first();
  await firstChecklistRow.locator(".checklist-note-toggle").click();
  await firstChecklistRow.locator(".item-note-input").waitFor({ state: "visible" });
  await firstChecklistRow.locator(".item-note-input").fill("Oxygen need increased during hallway ambulation.");
  const noteInteractionAudit = await page.evaluate(() => {
    const row = document.querySelector(".checklist-row");
    const toggle = row?.querySelector(".checklist-note-toggle");
    const note = row?.querySelector(".item-note-input");
    const panel = row?.querySelector(".checklist-note-panel");
    const rect = note?.getBoundingClientRect();
    const style = note ? getComputedStyle(note) : null;
    return {
      expanded: toggle?.getAttribute("aria-expanded") || "",
      controls: toggle?.getAttribute("aria-controls") || "",
      panelHidden: panel?.hidden ?? true,
      noteValue: note?.value || "",
      noteHeight: rect?.height || 0,
      noteOpacity: style?.opacity || ""
    };
  });
  assert(noteInteractionAudit.expanded === "true", `note button should expand the note panel: ${JSON.stringify(noteInteractionAudit)}`);
  assert(noteInteractionAudit.controls && !noteInteractionAudit.panelHidden, `note panel should be exposed to assistive tech: ${JSON.stringify(noteInteractionAudit)}`);
  assert(noteInteractionAudit.noteHeight >= 40 && noteInteractionAudit.noteOpacity !== "0", `note editor should be visibly usable: ${JSON.stringify(noteInteractionAudit)}`);
  assert(noteInteractionAudit.noteValue.includes("Oxygen need increased"), `note text should be retained in the row editor: ${JSON.stringify(noteInteractionAudit)}`);
  await page.click("#reviewFindingsButton");
  await page.waitForSelector("#finalView:not([hidden])");
  const noteFinalText = await page.textContent("#finalUpdatePreview");
  assert(noteFinalText.includes("Oxygen need increased during hallway ambulation."), "row-level checklist notes should appear in the final update");

  await page.goto(`${baseUrl}/index.html?auditPage=workspace&caseWorkupControlAudit=${Date.now()}`);
  await unlockVaultIfNeeded(page, vaultPassword);
  await page.waitForSelector("#workspaceView:not([hidden])");
  await selectPatientByTitle(page, "Case C - CHF exacerbation");
  await page.click("#patientOverviewWorkupButton");
  await page.waitForSelector("#patientWorkupPanel:not([hidden])");
  await page.fill("#patientWorkupConcernInput", "chest pain palpitations dyspnea");
  await page.waitForFunction(() => document.querySelector("#patientBuildChecklistButton")?.disabled === false);
  await page.click("#patientBuildChecklistButton");
  await page.waitForSelector("#workspaceView:not([hidden])");
  const caseCWorkspaceChecklistTab = await page.getAttribute('[data-patient-tab="checklist"]', "aria-selected");
  if (caseCWorkspaceChecklistTab !== "true") {
    const audit = await page.evaluate(() => ({
      status: document.querySelector("#statusLive")?.textContent?.trim() || "",
      buildStatus: document.querySelector("#patientWorkupBuildStatus")?.textContent?.trim() || "",
      workupValue: document.querySelector("#patientWorkupSelect")?.value || "",
      checklistStatus: document.querySelector("#workspaceChecklistStatus")?.textContent?.trim() || "",
      activeTab: Array.from(document.querySelectorAll("[data-patient-tab]")).find((button) => button.getAttribute("aria-selected") === "true")?.dataset.patientTab || ""
    }));
    assert(false, `patient-scoped checklist build should open the patient checklist tab: ${JSON.stringify({ ...audit, diagnostics: browserDiagnostics.slice(-8) })}`);
  }
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForSelector("#bedsideView:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll("#checklistSections .checklist-row").length >= 20);
  const patientScopeTitle = await page.textContent("#bedsideView .patient-scope-main strong");
  assert(patientScopeTitle.includes("Case C - CHF exacerbation"), "patient-scoped checklist build should carry the selected case into bedside mode");
  const caseCControlAudit = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#checklistSections .checklist-row")).map((row) => ({
      question: row.querySelector(".checklist-question")?.textContent?.trim() || "",
      groupClass: row.querySelector(".answer-group, .endorsement-list")?.className || "",
      chips: Array.from(row.querySelectorAll(".answer-chip")).map((button) => button.textContent.trim()),
      endorsementLabels: Array.from(row.querySelectorAll(".endorsement-label")).map((label) => label.textContent.trim())
    }));
    return {
      palpitations: rows.find((row) => row.question === "Any palpitations?"),
      neurologic: rows.find((row) => row.question === "Any neurologic symptoms?"),
      badEndorsementLabels: rows.flatMap((row) => row.endorsementLabels.map((label) => ({ question: row.question, label })))
        .filter(({ label }) => /^(?:Not|Other|Mild|Moderate|Severe|Known|Current|Prior)$/i.test(label))
    };
  });
  assert(caseCControlAudit.palpitations, "case C checklist should include the palpitations row");
  assert(caseCControlAudit.palpitations.groupClass === "answer-group", "single-symptom palpitations severity should be one answer-choice group, not repeated Yes/No endorsements");
  assert(caseCControlAudit.palpitations.chips.length >= 4, "palpitations row should expose severity/timing answer chips");
  assert(caseCControlAudit.neurologic, "case C checklist should include the neurologic symptom bucket");
  assert(caseCControlAudit.neurologic.groupClass === "endorsement-list", "broad neurologic symptom bucket should keep independent -/+ endorsements");
  assert(caseCControlAudit.neurologic.endorsementLabels.some((label) => /Focal weakness/i.test(label)), "neurologic symptom endorsements should expose concrete components");
  assert(caseCControlAudit.badEndorsementLabels.length === 0, `endorsement controls must not create standalone Not/Other/Mild/Moderate/Severe labels: ${JSON.stringify(caseCControlAudit.badEndorsementLabels)}`);
  const neurologicRows = page.locator(".checklist-row", { hasText: "Any neurologic symptoms?" }).locator(".endorsement-row");
  await neurologicRows.first().locator('.endorsement-button[data-status="positive"]').click();
  await neurologicRows.nth(1).locator('.endorsement-button[data-status="negative"]').click();
  const neurologicPressed = await page.locator('.checklist-row:has-text("Any neurologic symptoms?") .endorsement-button[aria-pressed="true"]').count();
  assert(neurologicPressed >= 2, "broad symptom endorsement controls should allow multiple independent selections");
  const neurologicPayload = await page.locator('.checklist-row:has-text("Any neurologic symptoms?")').first().getAttribute("data-answer-payload");
  assert(/endorses/i.test(neurologicPayload || "") && /denies/i.test(neurologicPayload || ""), `endorsement payload should preserve concurrent denies/endorses values, got ${neurologicPayload}`);
  const multiSelectTarget = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.checklist-row[data-input-mode="multi-select"]'));
    for (const row of rows) {
      const options = Array.from(row.querySelectorAll(".answer-chip"))
        .map((button) => ({ value: button.dataset.answerValue || "", label: button.textContent?.trim() || "" }))
        .filter(({ value }) => value && !/^(?:no\b|none\b|not\b|normal\b|baseline\b|clear\b|unknown\b|unsure\b|unable\b|not tried\b|not assessed\b|not applicable\b|room air\b|intact\b|yes\b)/i.test(value));
      if (options.length >= 2) {
        return {
          question: row.querySelector(".checklist-question")?.textContent?.trim() || "",
          values: [options[0].value, options[1].value]
        };
      }
    }
    return null;
  });
  assert(multiSelectTarget, "checklist should expose at least one concurrent multi-select row");
  await clickChecklistChipByValue(page, multiSelectTarget.question, multiSelectTarget.values[0]);
  await clickChecklistChipByValue(page, multiSelectTarget.question, multiSelectTarget.values[1]);
  const multiSelectPayload = await page.evaluate(({ question }) => {
    const row = Array.from(document.querySelectorAll(".checklist-row"))
      .find((candidate) => candidate.querySelector(".checklist-question")?.textContent?.trim() === question);
    return row?.dataset.answerPayload || "";
  }, multiSelectTarget);
  const parsedMultiSelectPayload = JSON.parse(multiSelectPayload);
  assert(
    Array.isArray(parsedMultiSelectPayload)
      && multiSelectTarget.values.every((value) => parsedMultiSelectPayload.includes(value)),
    `multi-select row should preserve concurrent values, got ${multiSelectPayload}`
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector("#bedsideView:not([hidden])");
  const mobileChecklistAudit = await page.evaluate(() => {
    const rootElement = document.scrollingElement || document.documentElement;
    const bottomBar = document.querySelector(".bedside-bottom-bar")?.getBoundingClientRect();
    const usableBottom = window.innerHeight - (bottomBar?.height || 0);
    const rows = Array.from(document.querySelectorAll("#checklistSections .checklist-row"))
      .map((row) => row.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const controls = Array.from(document.querySelectorAll(".answer-chip, .endorsement-button"))
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const sortedRows = rows.slice().sort((a, b) => a.top - b.top);
    let overlapCount = 0;
    for (let index = 1; index < sortedRows.length; index += 1) {
      if (sortedRows[index].top < sortedRows[index - 1].bottom - 1) overlapCount += 1;
    }
    return {
      horizontalOverflow: rootElement.scrollWidth - document.documentElement.clientWidth,
      visibleRows: rows.filter((rect) => rect.top < usableBottom && rect.bottom > 0).length,
      firstRowHeight: rows[0]?.height || 0,
      minControlHeight: controls.length ? Math.min(...controls.map((rect) => rect.height)) : 0,
      overlapCount
    };
  });
  assert(mobileChecklistAudit.horizontalOverflow <= 2, `mobile bedside checklist should not overflow horizontally: ${JSON.stringify(mobileChecklistAudit)}`);
  assert(mobileChecklistAudit.visibleRows >= 1, `mobile bedside checklist should keep actionable rows visible: ${JSON.stringify(mobileChecklistAudit)}`);
  assert(mobileChecklistAudit.firstRowHeight > 0 && mobileChecklistAudit.firstRowHeight <= 360, `mobile checklist cards should stay compact: ${JSON.stringify(mobileChecklistAudit)}`);
  assert(mobileChecklistAudit.minControlHeight >= 32, `mobile checklist controls should remain tappable: ${JSON.stringify(mobileChecklistAudit)}`);
  assert(mobileChecklistAudit.overlapCount === 0, `mobile checklist rows should not visually overlap: ${JSON.stringify(mobileChecklistAudit)}`);
  await page.setViewportSize({ width: 1440, height: 1024 });

  await page.goto(`${baseUrl}/index.html?auditPage=workspace&caseBWorkupSelectionAudit=${Date.now()}`);
  await unlockVaultIfNeeded(page, vaultPassword);
  await page.waitForSelector("#workspaceView:not([hidden])");
  await selectPatientByTitle(page, "Case B - Pneumonia");
  await page.click("#patientOverviewWorkupButton");
  await page.waitForSelector("#patientWorkupPanel:not([hidden])");
  await page.fill("#patientWorkupConcernInput", "pneumonia");
  await page.waitForFunction(() => document.querySelector("#patientWorkupSelect")?.value === "fever_infection_sepsis_v1");
  const caseBWorkupSelection = await page.evaluate(() => ({
    selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
    intentLabel: document.querySelector("#patientValidatedIntentLabel")?.textContent?.trim() || "",
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false,
    buildStatus: document.querySelector("#patientWorkupBuildStatus")?.textContent?.trim() || "",
    visibleSelectLabel: Array.from(document.querySelectorAll("label")).some((label) => /Validated workup to use/i.test(label.textContent || "")),
    resultRowCount: document.querySelectorAll("#patientWorkupResults .workup-result-row").length,
    resultSelection: document.querySelector('#patientWorkupResults .workup-result-row[aria-selected="true"]')?.dataset.moduleId || "",
    matchGroupLabel: document.querySelector("#patientWorkupSelect optgroup")?.label || "",
    optionTexts: Array.from(document.querySelectorAll("#patientWorkupSelect option")).map((option) => option.textContent || "")
  }));
  assert(caseBWorkupSelection.selectValue === "fever_infection_sepsis_v1", `Case B should select the fever/infection workup, got ${JSON.stringify(caseBWorkupSelection)}`);
  assert(/Fever, infection, or sepsis/i.test(caseBWorkupSelection.intentLabel), `Case B should show the selected infection workup, got ${caseBWorkupSelection.intentLabel}`);
  assert(/Matches for "pneumonia"|Saved workup for this patient/i.test(caseBWorkupSelection.matchGroupLabel), `Workup search should show a matches or saved-workup dropdown group, got ${JSON.stringify(caseBWorkupSelection)}`);
  assert(caseBWorkupSelection.optionTexts.some((text) => /Fever, infection, or sepsis/i.test(text)), "Workup search dropdown should include the matching infection module");
  assert(caseBWorkupSelection.visibleSelectLabel === false, "workup UI should not expose a separate visible dropdown label");
  assert(caseBWorkupSelection.resultRowCount >= 1, "workup UI should show selectable result rows in the unified picker");
  assert(caseBWorkupSelection.resultSelection === "fever_infection_sepsis_v1", "selected workup should be reflected in the result list");
  assert(!caseBWorkupSelection.buildDisabled, "Case B selected workup should allow checklist generation");
  await page.click("#patientBuildChecklistButton");
  await page.waitForSelector("#workspaceView:not([hidden])");
  const caseBWorkspaceChecklistTab = await page.getAttribute('[data-patient-tab="checklist"]', "aria-selected");
  if (caseBWorkspaceChecklistTab !== "true") {
    const audit = await page.evaluate(() => ({
      status: document.querySelector("#statusLive")?.textContent?.trim() || "",
      buildStatus: document.querySelector("#patientWorkupBuildStatus")?.textContent?.trim() || "",
      workupValue: document.querySelector("#patientWorkupSelect")?.value || "",
      checklistStatus: document.querySelector("#workspaceChecklistStatus")?.textContent?.trim() || "",
      activeTab: Array.from(document.querySelectorAll("[data-patient-tab]")).find((button) => button.getAttribute("aria-selected") === "true")?.dataset.patientTab || ""
    }));
    assert(false, `building a patient checklist should keep the user in the patient checklist tab: ${JSON.stringify({ ...audit, diagnostics: browserDiagnostics.slice(-8) })}`);
  }
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForSelector("#bedsideView:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll("#checklistSections .checklist-row").length >= 12);
  const caseBChecklistAudit = await page.evaluate(() => {
    const rowText = Array.from(document.querySelectorAll("#checklistSections .checklist-row")).map((row) => row.textContent || "").join("\n");
    return {
      patientScope: document.querySelector("#bedsideView .patient-scope-main strong")?.textContent?.trim() || "",
      rowText,
      selectValue: document.querySelector("#patientWorkupSelect")?.value || ""
    };
  });
  assert(caseBChecklistAudit.patientScope.includes("Case B - Pneumonia"), "Case B checklist should carry the selected patient into bedside mode");
  assert(/fever|respiratory|source|oxygen|cough|sepsis/i.test(caseBChecklistAudit.rowText), "Case B checklist should contain infection/pneumonia-relevant rows");
  assert(!/ketone|anion gap|insulin drip|basal transition/i.test(caseBChecklistAudit.rowText), "Case B checklist should not contain DKA-specific checklist rows");
  await page.click("#reviewFindingsButton");
  await page.waitForSelector("#finalView:not([hidden])");
  await page.click("#finalToEvidenceButton");
  await page.waitForSelector("#evidenceView:not([hidden])");
  const caseBEvidencePrompt = await page.textContent("#openEvidencePromptPreview");
  assert(caseBEvidencePrompt.includes("Case B - Pneumonia"), "Case B OpenEvidence prompt should include the selected patient title");
  assert(caseBEvidencePrompt.includes("Selected workup: Fever, infection, or sepsis"), "Case B OpenEvidence prompt should include the selected workup");
  assert(!caseBEvidencePrompt.includes("Synthetic adult DKA consult"), "Case B OpenEvidence prompt should not fall back to the DKA sample context");

  await page.goto(`${baseUrl}/index.html?auditPage=workspace&unsupportedWorkupAudit=${Date.now()}`);
  await unlockVaultIfNeeded(page, vaultPassword);
  await page.waitForSelector("#workspaceView:not([hidden])");
  await selectPatientByTitle(page, "Case H - Chest pain");
  await page.click("#patientOverviewWorkupButton");
  await page.waitForSelector("#patientWorkupPanel:not([hidden])");
  const unsupportedAudit = await page.evaluate(() => ({
    selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
    intentLabel: document.querySelector("#patientValidatedIntentLabel")?.textContent?.trim() || "",
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false,
    rows: document.querySelectorAll("#patientWorkupRows .workup-row").length,
    detail: document.querySelector("#patientWorkupDetail")?.textContent?.trim() || "",
    emptyNotice: document.querySelector("#patientWorkupResults .workup-picker-empty")?.textContent?.trim() || "",
    resultRowCount: document.querySelectorAll("#patientWorkupResults .workup-result-row").length
  }));
  assert(unsupportedAudit.selectValue === "", `Unsupported AKI case should not auto-select DKA or another workup: ${JSON.stringify(unsupportedAudit)}`);
  assert(/No validated workup selected/i.test(unsupportedAudit.intentLabel), `Unsupported AKI case should show a no-workup-selected label: ${JSON.stringify(unsupportedAudit)}`);
  assert(unsupportedAudit.buildDisabled, "Unsupported AKI case should disable checklist generation until a workup is chosen");
  assert(unsupportedAudit.rows === 0, "Unsupported AKI case should not render stale workup rows");
  assert(/Select a validated workup/i.test(unsupportedAudit.detail), "Unsupported AKI case should tell the user to choose a workup");
  assert(/No exact local .* workup installed/i.test(unsupportedAudit.emptyNotice), `unsupported workup picker should show a no-exact-match notice: ${JSON.stringify(unsupportedAudit)}`);
  assert(unsupportedAudit.resultRowCount >= 1, "unsupported workup picker should still offer selectable reviewed workups");
  await page.fill("#patientWorkupConcernInput", "");
  await page.waitForFunction(() => document.querySelector("#patientWorkupConcernInput")?.value === "");
  const clearedSearchAudit = await page.evaluate(() => ({
    inputValue: document.querySelector("#patientWorkupConcernInput")?.value || "",
    selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false,
    prompt: document.querySelector("#patientWorkupResults .workup-picker-empty")?.textContent?.trim() || "",
    resultRowCount: document.querySelectorAll("#patientWorkupResults .workup-result-row").length,
    resultGroups: Array.from(document.querySelectorAll("#patientWorkupResults .workup-result-group-title")).map((node) => node.textContent || ""),
    nativeOptionCount: document.querySelectorAll("#patientWorkupSelect option").length
  }));
  assert(clearedSearchAudit.inputValue === "", `Clearing the workup search should keep it empty: ${JSON.stringify(clearedSearchAudit)}`);
  assert(clearedSearchAudit.selectValue === "", "clearing an unsupported workup search should not leave a stale selected workup");
  assert(clearedSearchAudit.buildDisabled, "clearing an unsupported workup search should keep checklist generation disabled");
  assert(/Search for a workup/i.test(clearedSearchAudit.prompt), `cleared search should show a true empty-search prompt: ${JSON.stringify(clearedSearchAudit)}`);
  assert(clearedSearchAudit.resultRowCount > 0 && clearedSearchAudit.resultRowCount <= 6, `cleared search should show capped suggestions, got ${JSON.stringify(clearedSearchAudit)}`);
  assert(!clearedSearchAudit.resultGroups.some((label) => /All validated workups/i.test(label)), `cleared search should not dump all workups: ${JSON.stringify(clearedSearchAudit)}`);
  assert(clearedSearchAudit.nativeOptionCount <= 8, `hidden native select should stay capped with the visible picker: ${JSON.stringify(clearedSearchAudit)}`);
  await page.click('#patientWorkupResults .workup-result-row[data-module-id="chest_pain_v1"]');
  await page.waitForFunction(() => document.querySelector("#patientBuildChecklistButton")?.disabled === false);
  const caseHManualSelection = await page.evaluate(() => ({
    selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
    intentLabel: document.querySelector("#patientValidatedIntentLabel")?.textContent?.trim() || "",
    rows: document.querySelectorAll("#patientWorkupRows .workup-row").length,
    buildDisabled: document.querySelector("#patientBuildChecklistButton")?.disabled || false
  }));
  assert(caseHManualSelection.selectValue === "chest_pain_v1", `Manual dropdown selection should set Case H workup: ${JSON.stringify(caseHManualSelection)}`);
  assert(/Chest pain/i.test(caseHManualSelection.intentLabel), `Manual dropdown selection should update the visible intent: ${JSON.stringify(caseHManualSelection)}`);
  assert(caseHManualSelection.rows >= 6 && !caseHManualSelection.buildDisabled, "Manual dropdown selection should render workup rows and enable checklist generation");
  await selectPatientByTitle(page, "Case B - Pneumonia");
  await selectPatientByTitle(page, "Case H - Chest pain");
  await page.click("#patientOverviewWorkupButton");
  await page.waitForSelector("#patientWorkupPanel:not([hidden])");
  const caseHPersistedSelection = await page.evaluate(() => ({
    selectValue: document.querySelector("#patientWorkupSelect")?.value || "",
    intentLabel: document.querySelector("#patientValidatedIntentLabel")?.textContent?.trim() || ""
  }));
  assert(caseHPersistedSelection.selectValue === "chest_pain_v1", `Case H manually selected workup should persist after switching patients: ${JSON.stringify(caseHPersistedSelection)}`);

  await assertNoHorizontalOverflow(page, "clinical UI browser workflow");
  console.log("Clinical UI browser checks passed.");
} finally {
  if (browser) await browser.close();
  server.close();
}
