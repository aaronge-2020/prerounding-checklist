const { createRequire } = require("module");
const fs = require("fs");
const path = require("path");

const requireFromDeps = createRequire(
  "C:/Users/Aaron Ge/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.codex-require.js"
);
const { chromium } = requireFromDeps("playwright");

const outDir = __dirname;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    deviceScaleFactor: 1,
    acceptDownloads: true
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("PAGE_ERROR", error.message));
  await page.goto("http://127.0.0.1:4173/index.html", { waitUntil: "load" });
  await page.waitForTimeout(400);

  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (indexedDB.databases) {
      for (const db of await indexedDB.databases()) {
        if (!db.name) continue;
        await new Promise((resolve) => {
          const request = indexedDB.deleteDatabase(db.name);
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
      }
    }

    const census = await import("./census.js");
    const sectionRows = [
      ["Identity & Situation", ["Confirm one-liner", "Ask overnight change"]],
      ["Symptoms & History", ["Nausea and oral intake", "Abdominal pain", "Polyuria", "Weakness", "Insulin access", "Discharge barriers"]],
      ["DKA-specific Assessment", ["Gap closure understanding", "Insulin transition", "Hypoglycemia", "Sick-day plan", "Ketone access", "Supplies", "Return precautions"]],
      ["Medical History & Risks", ["Home regimen", "Prior DKA", "Adherence", "Follow-up", "Food access"]],
      ["Physical Exam", ["Mental status", "Volume status", "Abdomen", "Injection sites"]],
      ["Labs & Monitoring", ["Glucose", "Potassium", "Bicarbonate/gap", "Renal function"]]
    ];
    const sections = sectionRows.map(([title, labels]) => ({
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      items: labels.map((label, index) => ({
        id: `${title}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        category: index % 3 === 0 ? "must-ask" : "bedside",
        highRisk: index === 0 && /DKA|Labs/.test(title),
        options: [],
        hasNotes: true
      }))
    }));
    const scrubbed =
      "Synthetic de-identified DKA consult context: adult learner preparing for rounds, improving glucose trend, closing anion gap, potassium replacement, oral intake trial, and insulin transition planning. No names, dates, locations, or identifiers.";
    const patient = census.createPatientCase({
      id: "case-a",
      alias: "Case A",
      roomBed: "Case A",
      serviceProblem: "DKA consult",
      highPriority: true,
      sourceMode: "prior",
      scrubbedNote: scrubbed,
      deidentifiedSourceSections: {
        note: "Synthetic DKA source note without identifiers. Gap improving, oral intake being assessed, insulin transition pending.",
        labs: "Synthetic labs: glucose improving, bicarbonate rising, anion gap closing, potassium monitored.",
        handoff: "Synthetic handoff: nausea improved, no hypotension, confirm overnight intake.",
        mar: "Synthetic MAR: insulin infusion, basal insulin plan, potassium replacement."
      },
      scrubResult: { text: scrubbed, redactionTotal: 0, counts: {}, flags: [], entities: [], residualWarnings: [] },
      promptCollapsed: true,
      checklistFirstMode: false,
      initialRoundsPromptCopied: true,
      checklistPromptCopied: true,
      conversationContextReady: true,
      conversationChecklistReady: true,
      conversationCaseKey: "Case A",
      checklistRawText: sections.map((section) => `${section.title}\n${section.items.map((item) => `- ${item.label}`).join("\n")}`).join("\n\n"),
      sections,
      activeChecklistView: "bedside"
    });
    const vault = census.normalizeCensusVault({
      schemaVersion: 1,
      createdAt: "2026-06-08T11:30:00.000Z",
      updatedAt: "2026-06-08T11:30:00.000Z",
      patients: [patient],
      activePatientId: "case-a",
      continuityCases: [],
      activeContinuityCaseId: ""
    });
    const envelope = await census.encryptJsonPayload(vault, "codex-pass-123", {
      type: census.CENSUS_STORAGE_TYPE,
      iterations: 1000
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("preRoundsCensusVaultV1", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("vault")) db.createObjectStore("vault", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("vault", "readwrite");
        tx.objectStore("vault").put({ id: "active", envelope });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.fill("#censusPassphraseInput", "codex-pass-123");
  await page.click("#unlockCensusButton");
  await page.waitForFunction(() => document.body.dataset.laptopHandoffReady === "true", { timeout: 20000 });
  await page.evaluate(() => {
    document.body.dataset.screen = "pasteScreen";
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.hidden = screen.id !== "pasteScreen";
    });
  });
  await Promise.all([
    page.waitForEvent("download", { timeout: 12000 }).catch(() => null),
    page.click("#heroMoveToPhoneButton")
  ]);
  await page.waitForFunction(() => !document.querySelector("#transferExportPanel")?.hidden, { timeout: 12000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await page.waitForTimeout(450);

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        display: getComputedStyle(el).display,
        hidden: el.hidden
      };
    };
    const root = document.documentElement;
    return {
      screen: document.body.dataset.screen,
      laptopHandoffReady: document.body.dataset.laptopHandoffReady,
      scrollY: Math.round(window.scrollY),
      overflowX: root.scrollWidth > root.clientWidth,
      doc: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight },
      topbar: box(".app-topbar"),
      rail: box(".workflow-rail"),
      card: box("#laptopHandoffCard"),
      hero: box("#laptopHandoffCard > div:first-child"),
      preview: box(".handoff-checklist-preview"),
      actions: box("#laptopHandoffCard > .compact-summary-actions"),
      heroUse: box("#heroUseChecklistOnLaptopButton"),
      heroMove: box("#heroMoveToPhoneButton"),
      transfer: box("#transferExportPanel"),
      transferCode: document.querySelector("#transferCodeDisplay")?.textContent || ""
    };
  });
  await page.screenshot({
    path: path.join(outDir, "B09-phone-handoff-context-export-desktop-closer.png"),
    fullPage: false
  });
  fs.writeFileSync(path.join(outDir, "B09-phone-handoff-context-export-desktop-closer.metrics.json"), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
