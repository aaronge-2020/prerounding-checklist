// E2E: per-problem AI Assessment & Plan generation in the Review draft editor.
// Mocks the OpenAI Responses API; verifies the Generate button, the
// de-identification confirm modal, and insertion of the differential,
// diagnostic plan, and therapeutic plan with citations.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const mockApResponse = {
  differentials: [
    { diagnosis: "Acute decompensated heart failure", reasoning: "Orthopnea, edema, known HFrEF", likelihood: "most likely" },
    { diagnosis: "Pneumonia", reasoning: "Fever and infiltrate possible", likelihood: "possible" }
  ],
  diagnosticPlan: [
    { order: "BNP", indication: "Confirm cardiac decompensation", citationIds: [1] },
    { order: "Chest radiograph, PA and lateral", indication: "Pulmonary edema vs infiltrate", citationIds: [] }
  ],
  therapeuticPlan: [
    { order: "Furosemide", details: "40 mg IV BID", rationale: "Diuresis for volume overload", citationIds: [1] },
    { order: "Metoprolol succinate", details: "25 mg PO daily, continue home dose", rationale: "GDMT continuation", citationIds: [2] }
  ],
  references: [
    { id: 1, title: "Acute Decompensated Heart Failure guideline", authors: "ACC/AHA", journal: "Circulation", year: "2022", url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063" },
    { id: 2, title: "MERIT-HF", authors: "MERIT-HF Study Group", journal: "Lancet", year: "1999", url: "https://pubmed.ncbi.nlm.nih.gov/10376685/" }
  ]
};

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
};

try {
  await openRealApp(page, appUrl);
  await unlockAndCreatePatient(page);

  // Mock the OpenAI Responses API before any generation request.
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    assert.ok(Array.isArray(body.tools), "web_search tool must be requested");
    assert.ok(String(body.input).includes("Heart failure"), "prompt must include the problem");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ output_text: JSON.stringify(mockApResponse) })
    });
  });

  // Save a (fake) API key through the real Settings UI.
  await page.click('[data-view-target="settings"]');
  await page.waitForSelector("#openAiApiKeyInput");
  await page.fill("#openAiApiKeyInput", "test-key-do-not-use");
  await page.click('[data-action="save-openai-byok"]');
  await page.waitForFunction(() => /saved|Saved/.test(document.querySelector("#statusLine")?.textContent || ""));

  // Build a minimal review draft with one problem.
  await page.click('[data-view-target="daily"]');
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="admission"][data-note-mode="sections"]');
  await page.fill('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]', "Adult with acute decompensated heart failure.");
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="admission"]');
  await page.waitForFunction(() => /saved/i.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");

  await check("Generate button renders on each problem card", async () => {
    await page.click('[data-action="add-plan-problem"]');
    const problem = page.locator(".plan-problem-card").first();
    await problem.locator('[data-problem-field="problem"]').fill("Heart failure");
    await problem.locator('[data-problem-field="keyContext"]').fill("Volume overloaded on exam");
    assert.equal(await page.locator('[data-action="generate-ap"]').count(), 1);
  });

  await check("Generate opens a de-identification confirm modal showing the exact payload", async () => {
    await page.click('[data-action="generate-ap"]');
    await page.waitForSelector(".ap-confirm-modal");
    const modalText = await page.locator(".ap-confirm-context").innerText();
    assert.match(modalText, /Heart failure/);
    assert.match(modalText, /Volume overloaded on exam/);
    assert.match(modalText, /Adult with acute decompensated heart failure/);
  });

  await check("Confirming generates and inserts differential, plans, and citations", async () => {
    await page.click('[data-action="ap-confirm-generate"]');
    await page.waitForFunction(
      () => /Plan generated/.test(document.querySelector("#statusLine")?.textContent || ""),
      null,
      { timeout: 15000 }
    );
    const problem = page.locator(".plan-problem-card").first();
    assert.equal(await problem.locator('[data-differential-field="diagnosis"]').count(), 2);
    assert.match(await problem.locator('[data-differential-field="diagnosis"]').first().innerText(), /Acute decompensated heart failure/);
    const dxPlan = await problem.locator('[data-problem-field="diagnosticPlan"]').innerHTML();
    assert.match(dxPlan, /BNP/);
    assert.match(dxPlan, /ahajournals\.org/, "citation link must be present");
    const txPlan = await problem.locator('[data-problem-field="therapeuticPlan"]').innerHTML();
    assert.match(txPlan, /Furosemide/);
    assert.match(txPlan, /40 mg IV BID/);
    assert.match(txPlan, /pubmed\.ncbi\.nlm\.nih\.gov/, "MERIT-HF citation link must be present");
    assert.match(txPlan, /References/);
  });

  await check("Cancel dismisses the modal without calling the API", async () => {
    await page.click('[data-action="add-plan-problem"]');
    const second = page.locator(".plan-problem-card").nth(1);
    await second.locator('[data-problem-field="problem"]').fill("Second problem");
    await second.locator('[data-action="generate-ap"]').click();
    await page.waitForSelector(".ap-confirm-modal");
    await page.click('[data-action="ap-confirm-cancel"]');
    assert.equal(await page.locator(".ap-confirm-modal").count(), 0);
    assert.equal(await second.locator('[data-differential-field="diagnosis"]').count(), 0);
  });

  await check("no JS errors", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  });
} finally {
  await browser.close();
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n=== AP GENERATION E2E PASSED ===");
