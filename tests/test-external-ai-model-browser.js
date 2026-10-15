// Real bundled Stanford worker + real outbound review; synthetic chart and
// mocked provider. This verifies integration, not clinical recall or HIPAA.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";
import { approveFinalRequest } from "./browser/external-ai-fixture.js";
const server = await createAppServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.selectOption("#deidModeSelect", "stanford-clinical");
  await page.click('[data-action="load-advanced-deid"]');
  await page.waitForFunction(() => /Ready:/.test(document.querySelector("[data-deid-selected-state]")?.textContent || ""), {}, { timeout: 120000 });
  let calls = 0;
  let sent;
  await page.route("https://api.openai.com/v1/responses", async route => {
    calls++;
    sent = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ output_text: "Synthetic test response" }) });
  });
  await page.evaluate(async () => {
    const { requestOpenAiChatWithUsage } = await import("/src/ui/openai-client.js?v=20261015-simple-review");
    globalThis.__realPrivacyResult = "pending";
    void requestOpenAiChatWithUsage({ apiKey: "synthetic-key", model: "test", input: "Patient Jane Smith presents with cough for three days. MRN 123456. Prior note: lungs clear." }).then(() => { globalThis.__realPrivacyResult = "sent"; }, () => { globalThis.__realPrivacyResult = "failed"; });
  });
  await page.locator("[data-external-ai-review]").waitFor();
  assert.equal(calls, 0);
  await page.locator("[data-external-scan]").click();
  await page.waitForFunction(() => /Scan complete|scan failed/.test(document.querySelector("[data-external-review-status]")?.textContent || ""), {}, { timeout: 120000 });
  assert.match(await page.locator("[data-external-review-status]").textContent(), /^Scan complete/);
  const preview = await page.locator("[data-external-request-preview]").textContent();
  assert.doesNotMatch(preview, /Jane Smith|123456/);
  assert.equal(calls, 0);
  assert.equal(await page.locator("[data-external-send]").isDisabled(), true);
  await page.locator("[data-external-reviewed]").check();
  await page.locator("[data-external-permitted]").check();
  await page.locator("[data-external-send]").click();
  await page.waitForFunction(() => globalThis.__realPrivacyResult !== "pending");
  assert.equal(await page.evaluate(() => globalThis.__realPrivacyResult), "sent");
  assert.equal(calls, 1);
  assert.deepEqual(sent, JSON.parse(preview), "the actual wire body equals the reviewed snapshot");
  assert.equal(sent.store, false);
  console.log("PASS: actual Stanford worker scans the final request, removes synthetic identifiers, blocks until approval, and transmits the exact reviewed snapshot to a mocked provider.");
  await page.unroute("https://api.openai.com/v1/responses");
  const evidenceBodies = [];
  const sourceUrl = "https://example.org/synthetic-study";
  await page.route("https://api.openai.com/v1/responses", async route => {
    const body = route.request().postDataJSON();
    evidenceBodies.push(body);
    const payload = body.text?.format.name === "consult_evidence_question"
      ? { output_text: JSON.stringify({ question: "Find primary evidence for treatment options in kidney impairment with eGFR 25." }) }
      : body.tools?.length
        ? { output_text: "Synthetic source discusses applicability in kidney impairment.", output: [{ type: "web_search_call", status: "completed", action: { sources: [{ url: sourceUrl, title: "Synthetic study" }] } }] }
        : { output_text: JSON.stringify({ suggestions: [{ id: 1, target: "diagnostic_plan", action: "add", anchor: "", suggested: "Review evidence applicability with the supervising clinician.", rationale: "The documented kidney function is relevant; applicability remains uncertain.", citationIds: [1] }], references: [] }) };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "completed", ...payload }) });
  });
  await page.evaluate(async () => {
    const { generateEvidenceBasedProblemRevisions } = await import("/src/ui/consult-evidence-api.js?v=20261015-simple-review");
    globalThis.__evidenceResult = null;
    void generateEvidenceBasedProblemRevisions({ apiKey: "synthetic-key", model: "test", prompt: "Patient Jane Smith, MRN 123456, has kidney impairment with eGFR 25.", instructions: "Draft a suggestion requiring clinician review." }).then(result => { globalThis.__evidenceResult = result; }, () => { globalThis.__evidenceResult = "failed"; });
  });
  await approveFinalRequest(page);
  await page.locator("[data-external-search-reviewed]").waitFor();
  await approveFinalRequest(page);
  await page.waitForFunction(() => document.querySelector('[data-external-field="instructions"]') && !document.querySelector("[data-external-search-reviewed]"));
  await approveFinalRequest(page);
  await page.waitForFunction(() => globalThis.__evidenceResult !== null);
  const grounded = await page.evaluate(() => globalThis.__evidenceResult);
  assert.notEqual(grounded, "failed");
  assert.equal(evidenceBodies.length, 3);
  assert.equal(evidenceBodies[1].instructions, undefined);
  assert.doesNotMatch(JSON.stringify(evidenceBodies), /Jane Smith|123456/);
  assert.equal(grounded.references[0].url, sourceUrl, "real final de-identification cannot destroy the locally bound public source URL");
  assert.equal(grounded.references[0].excerpt, "");
  console.log("PASS: actual Stanford worker supports all three evidence-consult stages; retrieved links are bound locally after synthesis and no synthetic identity reaches the mocked provider.");
} finally { await browser.close(); await server.close(); }
