import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const server = await createAppServer();
const unavailableServer = await createAppServer({ unavailablePrefixes: ["/models/"] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.selectOption("#deidModeSelect", "stanford-clinical");
  await page.click('[data-action="load-advanced-deid"]');
  await page.waitForFunction(() => /Ready:/.test(document.querySelector("[data-deid-selected-state]")?.textContent || ""), {}, { timeout: 120000 });
  console.log("PASS: bundled Stanford worker loaded and passed its readiness self-test");
  const examples = [
    "HISTORY OF PRESENT ILLNESS\nJane Smith presents with cough for three days.\n\nALLERGIES\nNKDA.\n\nPHYSICAL EXAM\nLungs clear.\n\nASSESSMENT\nCough.\n\nPLAN\nMonitor symptoms.",
    "Jane Smith reports improved breathing overnight. No new symptoms. Continue observation.",
    "INTERVAL EVENTS\nJane Smith had no acute events overnight.\n\nPHYSICAL EXAM\nAlert. Lungs clear.\n\nASSESSMENT\nImproving cough.\n\nPLAN\nContinue observation."
  ];
  for (const [index, note] of examples.entries()) {
    if (index === 2) {
      await page.locator(".new-day-control > summary").click();
      await page.fill("#newDayLabel", "Model-tested day");
      await page.click('[data-action="add-day"]');
    }
    await page.click('[data-note-mode="paste"]');
    await page.locator("[data-structured-note-paste]").fill(note);
    await page.click('[data-action="review-structured-note-sections"]');
    if (index === 0) assert.equal(await page.locator('[data-structured-note-field="allergies"]').inputValue(), "NKDA.", "parser preserves allergy content before model redaction");
    await page.click('[data-action="save-structured-primary-note"]');
    await page.waitForFunction(() => !document.querySelector("[data-note-original]") && /Primary-team note saved/.test(document.querySelector("#statusLine")?.textContent || ""), {}, { timeout: 120000 });
    const saved = await page.locator("[data-structured-note-field]").evaluateAll((nodes) => nodes.map((node) => node.value).join("\n"));
    assert.doesNotMatch(saved, /Jane Smith/);
    assert.match(saved, /cough|breathing/i);
    if (index === 0) assert.ok(saved.includes("NKDA"), "labeled inference must retain the allergy finding");
    assert.equal(await page.locator("#deidModeSelect").inputValue(), "stanford-clinical");
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("Jane Smith")), false);
    console.log(`PASS: Stanford de-identification and encrypted save for note ${index + 1}`);
  }
  assert.deepEqual(errors, []);
  const failedPage = await browser.newPage();
  await openRealApp(failedPage, unavailableServer.baseUrl);
  await unlockAndCreatePatient(failedPage);
  await failedPage.selectOption("#deidModeSelect", "stanford-clinical");
  await failedPage.locator("[data-structured-note-paste]").fill(examples[0]);
  await failedPage.click('[data-action="review-structured-note-sections"]');
  await failedPage.click('[data-action="save-structured-note-to-draft"]');
  await failedPage.waitForFunction(() => /couldn't load/i.test(document.querySelector("[data-deid-selected-state]")?.textContent || ""), {}, { timeout: 15000 }).catch(async (error) => {
    console.error("Unavailable-model status:", await failedPage.locator("#statusLine").textContent());
    console.error("Unavailable-model state:", await failedPage.locator("[data-deid-selected-state]").allTextContents());
    throw error;
  });
  assert.equal(await failedPage.locator("#dailyView").isVisible(), true, "failed model must keep the user in import");
  assert.equal(await failedPage.locator("[data-note-original]").textContent(), examples[0], "failed save retains the session draft");
  assert.equal(await failedPage.locator("#deidModeSelect").inputValue(), "stanford-clinical", "no silent model fallback");
  assert.equal(await failedPage.locator('[data-primary-note-summary]').count(), 0, "failed model must not save a primary note");
  console.log("PASS: model failure keeps the draft, does not save, and does not navigate to Write note");
} catch (error) {
  console.error("Model state:", await page.locator("[data-deid-selected-state]").allTextContents());
  console.error("Status:", await page.locator("#statusLine").textContent());
  throw error;
} finally {
  await browser.close();
  await server.close();
  await unavailableServer.close();
}
