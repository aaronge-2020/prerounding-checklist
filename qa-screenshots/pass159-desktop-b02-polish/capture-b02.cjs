const fs = require("fs");
const path = require("path");

const { chromium } = require("C:/Users/Aaron Ge/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright");

const outDir = __dirname;

function sectionRows(problem) {
  const labels = [
    "Overnight events",
    "Symptom trajectory",
    "Active treatment questions",
    "Discharge barriers",
    "Focused exam",
    "Labs and monitoring"
  ];
  return [
    {
      id: `${problem}-rounds`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: "Rounds checklist",
      items: labels.map((label, index) => ({
        id: `${problem}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        category: index < 2 ? "must-ask" : "bedside",
        highRisk: index === 0,
        options: [],
        hasNotes: true
      }))
    }
  ];
}

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
    const makeSectionRows = (problem) => {
      const labels = [
        "Overnight events",
        "Symptom trajectory",
        "Active treatment questions",
        "Discharge barriers",
        "Focused exam",
        "Labs and monitoring"
      ];
      return [
        {
          id: `${problem}-rounds`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          title: "Rounds checklist",
          items: labels.map((label, index) => ({
            id: `${problem}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            label,
            category: index < 2 ? "must-ask" : "bedside",
            highRisk: index === 0,
            options: [],
            hasNotes: true
          }))
        }
      ];
    };
    const makePatient = (values) => {
      const scrubbed = `Synthetic de-identified ${values.serviceProblem} context for inpatient pre-rounding. No names, dates, locations, room numbers, MRNs, phone numbers, or identifiers.`;
      const sections = makeSectionRows(values.serviceProblem);
      return census.createPatientCase({
        sourceMode: "prior",
        scrubbedNote: scrubbed,
        deidentifiedSourceSections: {
          note: `${values.serviceProblem} note: synthetic trend summary with no identifiers.`,
          labs: `${values.serviceProblem} labs: synthetic values reviewed for trend only.`,
          handoff: `${values.serviceProblem} handoff: synthetic overnight events.`,
          mar: `${values.serviceProblem} MAR: synthetic medication review.`
        },
        scrubResult: { text: scrubbed, redactionTotal: 0, counts: {}, flags: [], entities: [], residualWarnings: [] },
        initialRoundsPromptCopied: true,
        checklistPromptCopied: true,
        conversationContextReady: true,
        conversationChecklistReady: true,
        checklistRawText: sections
          .map((section) => `${section.title}\n${section.items.map((item) => `- ${item.label}`).join("\n")}`)
          .join("\n\n"),
        sections,
        activeChecklistView: "bedside",
        updatedAt: "2026-06-08T11:30:00.000Z",
        ...values
      });
    };

    const patients = [
      makePatient({
        id: "case-a",
        alias: "Case A",
        roomBed: "Slot A",
        serviceProblem: "DKA consult",
        highPriority: true,
        seenToday: false,
        bedsideFindingsReady: false,
        conversationFinalReady: false
      }),
      makePatient({
        id: "case-b",
        alias: "Case B",
        roomBed: "Slot B",
        serviceProblem: "Volume status",
        highPriority: false,
        seenToday: true,
        compiledText: "Synthetic bedside findings complete; final daily update pending.",
        bedsideFindingsReady: true,
        conversationFinalReady: false
      }),
      makePatient({
        id: "case-c",
        alias: "Case C",
        roomBed: "Slot C",
        serviceProblem: "Discharge teaching",
        highPriority: false,
        seenToday: true,
        compiledText: "Synthetic bedside findings complete.",
        bedsideFindingsReady: true,
        conversationFinalReady: true
      })
    ];

    const vault = census.normalizeCensusVault({
      schemaVersion: 1,
      createdAt: "2026-06-08T11:30:00.000Z",
      updatedAt: "2026-06-08T11:30:00.000Z",
      patients,
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
  await page.waitForFunction(() => document.body.dataset.screen === "censusScreen" && document.body.dataset.censusVault === "unlocked", { timeout: 20000 });
  await page.click("#exportCensusButton");
  await page.waitForFunction(() => Boolean(document.querySelector("#censusTransferCodeInput")?.value), { timeout: 12000 });
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
      vault: document.body.dataset.censusVault,
      scrollY: Math.round(window.scrollY),
      overflowX: root.scrollWidth > root.clientWidth,
      doc: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight },
      topbar: box(".app-topbar"),
      brand: box(".app-brand"),
      rail: box(".workflow-rail"),
      actions: box(".app-topbar-actions"),
      summary: box("#censusUnlockedSummary"),
      dashboard: box(".census-dashboard"),
      toolbar: box(".census-toolbar"),
      table: box("#patientTable"),
      editor: box(".patient-editor-panel"),
      side: box(".census-side"),
      queue: box(".prompt-queue-panel"),
      batch: box(".census-side .batch-intake-panel:nth-of-type(2)"),
      exportPanel: box(".census-side .batch-intake-panel:nth-of-type(3)"),
      privacy: box(".census-dashboard .census-status"),
      rows: [...document.querySelectorAll("#patientTable .patient-row:not(.patient-row-header)")].map((row) => row.textContent.trim().replace(/\s+/g, " ")),
      transferCode: document.querySelector("#censusTransferCodeInput")?.value || "",
      statusText: document.querySelector("#censusStatus")?.textContent || ""
    };
  });
  await page.screenshot({
    path: path.join(outDir, "B02-local-census-dashboard-desktop-current.png"),
    fullPage: false
  });
  fs.writeFileSync(path.join(outDir, "B02-local-census-dashboard-desktop-current.metrics.json"), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
