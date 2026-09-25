import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureUrl = `file://${join(root, "tests/browser/u1-u17-fixture.html")}`;

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--no-proxy-server"]
});
const consoleErrors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

try {
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

  // ---- U1/U2: vital summary cards via the real daily presentation module ----
  const vitals = await page.evaluate((esc) => {
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => esc[c]);
    const presentation = window.__modules.createDailyPresentation({ escapeHtml, icon: () => "" });
    const displayModel = {
      type: "vitals",
      title: "Vitals",
      columns: ["Vital", "Value"],
      groups: [{ label: "Vitals", timestamp: "", rows: [] }],
      statistics24h: [
        { name: "Heart rate", minimum: 88, maximum: 102, mean: 95, median: 96, count: 6, unit: "bpm" },
        { name: "SpO2", minimum: 97, maximum: 97, mean: 97, median: 97, count: 1, unit: "%" },
        { name: "Temperature", minimum: 37.3, maximum: 37.3, mean: 37.3, median: 37.3, count: 1, unit: "°C" }
      ]
    };
    document.getElementById("fixture").innerHTML = presentation.renderClinicalDisplay(displayModel);
    const cards = [...document.querySelectorAll(".clinical-vital-stat")];
    return {
      count: cards.length,
      heights: cards.map((el) => Math.round(el.getBoundingClientRect().height)),
      texts: cards.map((el) => el.textContent.replace(/\s+/g, " ").trim())
    };
  }, { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });
  console.log("U1/U2 fixture:", JSON.stringify(vitals));
  assert.equal(vitals.count, 3, "expected 3 vital cards");
  assert.ok(vitals.heights.every((h) => h === vitals.heights[0]), `U1: equal heights, got ${vitals.heights}`);
  console.log("PASS U1: vital cards equal heights in real Chromium layout");
  assert.ok(!vitals.texts.some((t) => /97\s*–\s*97|37\.3\s*–\s*37\.3/.test(t)), "U2: no redundant equal ranges");
  assert.ok(vitals.texts.some((t) => /88\s*–\s*102/.test(t)), "real ranges still render");
  console.log("PASS U2: single observations show a value, not x–x");
  await page.screenshot({ path: "/tmp/u1-u17-shots/fixture-vital-cards.png" });

  // ---- U17: detected sections via the real daily presentation module ----
  const detected = await page.evaluate(() => {
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const presentation = window.__modules.createDailyPresentation({ escapeHtml, icon: () => "" });
    const empty = presentation.renderStructuredNoteDetected({
      noteType: "progress", scope: "daily",
      parseResult: {
        detectedFieldIds: ["objective", "medications", "interval_events"],
        detectedTables: [
          { fieldId: "objective", type: "labs", rowCount: 0 },
          { fieldId: "medications", type: "facility_meds", rowCount: 0 }
        ]
      }
    });
    const withRows = presentation.renderStructuredNoteDetected({
      noteType: "progress", scope: "daily",
      parseResult: {
        detectedFieldIds: ["objective"],
        detectedTables: [{ fieldId: "objective", type: "labs", rowCount: 12 }]
      }
    });
    document.getElementById("fixture").innerHTML = `<div id="d1">${empty}</div><div id="d2">${withRows}</div>`;
    return {
      warnCount: document.querySelectorAll("#d1 .detected-warning").length,
      warnText: document.querySelector("#d1 .detected-warning-text")?.textContent || "",
      narrativeKeepsCheck: /✓[^\n]*Interval events/.test(document.querySelector("#d1").textContent || ""),
      checkOnRows: /✓/.test(document.querySelector("#d2").textContent || ""),
      warnOnRows: document.querySelectorAll("#d2 .detected-warning").length
    };
  });
  console.log("U17 fixture:", JSON.stringify(detected));
  assert.equal(detected.warnCount, 2, "U17: zero-row lab/med tables get warning markers");
  assert.match(detected.warnText, /no rows parsed/, "U17: warning explains itself");
  assert.ok(detected.narrativeKeepsCheck, "U17: narrative section with content keeps ✓");
  assert.ok(detected.checkOnRows, "populated tables keep ✓");
  assert.equal(detected.warnOnRows, 0, "populated tables get no warning");
  console.log("PASS U17: zero-row detected tables warn instead of ✓");

  // ---- U4: zero-yield lab/medication guidance via the real review module ----
  const zeroYield = await page.evaluate(() => {
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const { createReviewPresentation, notes } = { createReviewPresentation: window.__modules.createReviewPresentation, notes: window.__modules.notes };
    const presentation = createReviewPresentation({ escapeHtml, icon: () => "" });
    const draft = notes.normalizeNoteDraft(notes.createNoteDraft("progress", { patientId: "p", hospitalDayId: "d" }));
    const narrativeCard = (kind) => ({
      id: `narr-${kind}`, kind: "narrative", name: kind,
      group: kind === "medications" ? "medications" : "labs",
      searchText: kind, text: "K 4.1\nWBC 9.2",
      selectionCandidate: { searchText: kind }
    });
    const index = {
      vitals: [], pendingItems: [], reportItems: [], labFamilies: [],
      labs: [narrativeCard("labs")],
      medications: [narrativeCard("medications")],
      diagnosticResults: [],
      groups: [{ id: "vitals", label: "Vitals" }, { id: "labs", label: "Labs" }, { id: "medications", label: "Medications" }],
      objectiveCandidates: [], candidates: []
    };
    const html = presentation.renderReview({
      patientLabel: "Test patient", oneLiner: "", packets: [{ id: "admission", label: "Admission H&P" }],
      selectedPacketId: "admission", index, query: "", category: "all", draft,
      guidanceFor: () => "", differenceSelectionId: "", baselineEditorId: "",
      collapsedFamilies: new Set(), clinicalDataCollapsed: false, collapsedObjectiveGroups: new Set(),
      examFindingsUi: {}, collapsedDraftSections: new Set(), patientRequiredMessage: ""
    });
    document.getElementById("fixture").innerHTML = html;
    const hints = [...document.querySelectorAll(".review-zero-yield-hint")].map((el) => el.textContent.replace(/\s+/g, " ").trim());
    return { hintCount: hints.length, hints };
  });
  console.log("U4 fixture:", JSON.stringify(zeroYield));
  assert.equal(zeroYield.hintCount, 2, "U4: one hint each for labs and medications");
  assert.ok(zeroYield.hints.some((h) => /No structured labs parsed/.test(h)), "U4: lab hint names the table formats");
  assert.ok(zeroYield.hints.some((h) => /No structured medications parsed/.test(h)), "U4: medication hint names the table format");
  console.log("PASS U4: zero-yield guidance renders with accurate format help");

  // ---- U9: problem editor sanitizes raw markdown table titles ----
  const u9 = await page.evaluate(() => {
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const presentation = window.__modules.createReviewPresentation({ escapeHtml, icon: () => "" });
    const notes = window.__modules.notes;
    let draft = notes.normalizeNoteDraft(notes.createNoteDraft("progress", { patientId: "p", hospitalDayId: "d" }));
    draft = notes.addPlanProblem(draft, {
      problem: "| Problem | Plan |\n|---|---|\n| Hyperkalemia | fluids |",
      diagnosticPlan: "BMP"
    });
    const index = {
      vitals: [], pendingItems: [], reportItems: [], labFamilies: [], labs: [],
      medications: [], diagnosticResults: [],
      groups: [{ id: "vitals", label: "Vitals" }],
      objectiveCandidates: [], candidates: []
    };
    const html = presentation.renderReview({
      patientLabel: "Test patient", oneLiner: "", packets: [{ id: "admission", label: "Admission H&P" }],
      selectedPacketId: "admission", index, query: "", category: "all", draft,
      guidanceFor: () => "", differenceSelectionId: "", baselineEditorId: "",
      collapsedFamilies: new Set(), clinicalDataCollapsed: false, collapsedObjectiveGroups: new Set(),
      examFindingsUi: {}, collapsedDraftSections: new Set(), patientRequiredMessage: ""
    });
    document.getElementById("fixture").innerHTML = html;
    const titleEl = document.querySelector('[data-problem-field="problem"]');
    return { titleText: titleEl ? titleEl.textContent : null };
  });
  console.log("U9 fixture:", JSON.stringify(u9));
  assert.equal(u9.titleText, "Hyperkalemia", "U9: title becomes the first data row's first cell");
  console.log("PASS U9: problem editor title sanitized");

  // ---- U5: packet-data-aware defaulting (empty admission + populated day) ----
  const u5 = await page.evaluate(() => {
    const { resolveDefaultPacket } = window.__modules;
    // Empty Admission H&P, one populated hospital day.
    const patient = {
      days: [{
        id: "day1", label: "HD1", date: "2026-09-24",
        primaryTeamNote: { sections: { interval_events: { deidentifiedText: "NSTEMI progress note" } } }
      }]
    };
    // Both empty.
    const emptyPatient = { days: [{ id: "day1", label: "HD1", date: "2026-09-24" }] };
    // Populated admission, empty day.
    const admPatient = {
      admissionPrimaryTeamNote: { sections: { assessment: { deidentifiedText: "NSTEMI" } } },
      days: [{ id: "day1", label: "HD1", date: "2026-09-24" }]
    };
    // Empty primary note but a saved draft with content counts as populated.
    const notes = window.__modules.notes;
    const draftWithProblem = notes.addPlanProblem(
      notes.normalizeNoteDraft(notes.createNoteDraft("progress", { patientId: "p", hospitalDayId: "day1" })),
      { problem: "NSTEMI" }
    );
    const draftPatient = {
      days: [{ id: "day1", label: "HD1", date: "2026-09-24" }],
      noteDrafts: { day1: draftWithProblem }
    };
    return {
      emptyAdmissionPopulatedDay: resolveDefaultPacket(patient, "admission"),
      explicitDayKept: resolveDefaultPacket(patient, "day1"),
      bothEmpty: resolveDefaultPacket(emptyPatient, "admission"),
      populatedAdmissionKept: resolveDefaultPacket(admPatient, "admission"),
      savedDraftCounts: resolveDefaultPacket(draftPatient, "admission")
    };
  });
  console.log("U5 fixture:", JSON.stringify(u5));
  assert.equal(u5.emptyAdmissionPopulatedDay, "day1", "U5: empty admission + populated day → latest populated day");
  assert.equal(u5.explicitDayKept, "day1", "U5: explicit populated packet is kept");
  assert.equal(u5.bothEmpty, "admission", "U5: all empty → requested packet unchanged");
  assert.equal(u5.populatedAdmissionKept, "admission", "U5: populated admission is kept");
  assert.equal(u5.savedDraftCounts, "day1", "U5: a saved draft with content counts as populated");
  console.log("PASS U5: packet defaulting prefers the latest populated packet");

  // ---- U10: empty Plan guidance ----
  const u10 = await page.evaluate(() => {
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const presentation = window.__modules.createReviewPresentation({ escapeHtml, icon: () => "" });
    const notes = window.__modules.notes;
    const draft = notes.normalizeNoteDraft(notes.createNoteDraft("progress", { patientId: "p", hospitalDayId: "d" }));
    const index = {
      vitals: [], pendingItems: [], reportItems: [], labFamilies: [], labs: [],
      medications: [], diagnosticResults: [],
      groups: [{ id: "vitals", label: "Vitals" }],
      objectiveCandidates: [], candidates: []
    };
    const html = presentation.renderReview({
      patientLabel: "Test patient", oneLiner: "", packets: [{ id: "admission", label: "Admission H&P" }],
      selectedPacketId: "admission", index, query: "", category: "all", draft,
      guidanceFor: () => "", differenceSelectionId: "", baselineEditorId: "",
      collapsedFamilies: new Set(), clinicalDataCollapsed: false, collapsedObjectiveGroups: new Set(),
      examFindingsUi: {}, collapsedDraftSections: new Set(), patientRequiredMessage: ""
    });
    document.getElementById("fixture").innerHTML = html;
    const hint = document.querySelector(".plan-problem-list .ed-hint");
    return { hintText: hint ? hint.textContent.replace(/\s+/g, " ").trim() : null };
  });
  console.log("U10 fixture:", JSON.stringify(u10));
  assert.ok(u10.hintText && /may not have parsed/.test(u10.hintText), "U10: empty plan names parse failure");
  assert.ok(/pull button|add a problem manually/i.test(u10.hintText), "U10: empty plan directs next action");
  console.log("PASS U10: empty Plan explains and directs");

  console.log("\n=== MODULE-LEVEL BROWSER CHECKS PASSED ===");
  console.log("JS errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
  await browser.close();
}
