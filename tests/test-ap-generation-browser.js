// E2E: per-problem AI revision suggestions in the Review draft editor.
// Mocks the OpenAI Responses API; verifies the Generate button opens an
// EDITABLE prompt modal scoped to the single problem, that the edited prompt
// is sent verbatim, and that each returned suggestion can be approved or
// rejected individually (Google-Docs style) with the plan updating only for
// approved suggestions.
import assert from "node:assert/strict";
import { installSyntheticDeid, approveFinalRequest } from "./browser/external-ai-fixture.js";
import { chromium } from "playwright";
import { createAppServer, navigateToView, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const mockSuggestions = {
  suggestions: [
    { id: 1, target: "diagnostic_plan", action: "add", suggested: "BNP", rationale: "Confirm cardiac decompensation", citationIds: [1] },
    { id: 2, target: "therapeutic_plan", action: "revise", anchor: "Old med 10 mg PO daily", suggested: "New med 20 mg IV BID", rationale: "Better choice for this patient", citationIds: [] },
    { id: 3, target: "differential", action: "remove", anchor: "Old diagnosis", suggested: "", rationale: "Ruled out by the new data" }
  ],
  references: [
    { id: 1, title: "Acute Decompensated Heart Failure guideline", authors: "ACC/AHA", journal: "Circulation", year: "2022", url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063", excerpt: "Synthetic test excerpt: measure BNP to support evaluation.", sourceLocation: "Synthetic section 4" }
  ]
};

const server = await createAppServer();
const appUrl = server.baseUrl;
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
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
  await installSyntheticDeid(page);
  await openRealApp(page, appUrl);
  await unlockAndCreatePatient(page);

  // Mock the OpenAI Responses API before any generation request.
  let apiCalls = 0;
  let lastInput = "";
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    apiCalls += 1;
    const body = JSON.parse(route.request().postData() || "{}");
    lastInput = String(body.input || "");
    assert.equal(body.text.format.name, "problem_plan_suggestions", "suggestion schema must be requested");
    assert.equal(body.tools, undefined, "patient consults do not enable web search");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ output_text: JSON.stringify(mockSuggestions) })
    });
  });

  // Save a (fake) API key through the real Settings UI.
  await navigateToView(page, "settings");
  await page.waitForSelector("#openAiApiKeyInput");
  await page.fill("#openAiApiKeyInput", "not-a-real-key");
  await page.click('[data-action="save-openai-byok"]');
  await page.waitForFunction(() => /saved|Saved/.test(document.querySelector("#statusLine")?.textContent || ""));

  // Build a review draft with two problems; only the first gets generated.
  await page.click('[data-view-target="daily"]');
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="admission"][data-note-mode="sections"]');
  await page.fill('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]', "Adult with acute decompensated heart failure.");
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="admission"]');
  await page.waitForFunction(() => /saved/i.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");

  await check("two problems with existing plan content", async () => {
    await page.click('[data-action="add-plan-problem"]');
    const first = page.locator(".plan-problem-card").first();
    await first.locator('[data-problem-field="problem"]').fill("Heart failure");
    await first.locator('[data-problem-field="keyContext"]').fill("Volume overloaded on exam");
    await first.locator('[data-action="add-differential"]').click();
    await first.locator('[data-differential-field="diagnosis"]').fill("Old diagnosis");
    await first.locator('[data-problem-field="diagnosticPlan"]').fill("Old test");
    await first.locator('[data-problem-field="therapeuticPlan"]').fill("Old med 10 mg PO daily");
    await page.click('[data-action="add-plan-problem"]');
    const second = page.locator(".plan-problem-card").nth(1);
    await second.locator('[data-problem-field="problem"]').fill("Pneumonia");
    assert.equal(await page.locator('[data-action="generate-ap"]').count(), 2);
  });

  await check("Generate opens an editable prompt modal scoped to the single problem", async () => {
    await page.locator(".plan-problem-card").first().locator('[data-action="generate-ap"]').click();
    await page.waitForSelector(".ap-confirm-modal");
    await page.locator('[data-ap-request-field="evidenceBased"]').uncheck();
    const editor = page.locator("[data-ap-prompt-editor]");
    assert.equal(await editor.count(), 1, "prompt must be an editable textarea");
    const promptText = await editor.inputValue();
    assert.match(promptText, /Heart failure/, "prompt carries the problem");
    assert.match(promptText, /Old med 10 mg PO daily/, "prompt carries this problem's current plan");
    assert.match(promptText, /FULL COMPLETION/, "prompt instructs revision-style output");
    assert.ok(!promptText.includes("Pneumonia"), "other problems are NOT passed in");
  });

  await check("the student's prompt edits are sent verbatim to the API", async () => {
    const editor = page.locator("[data-ap-prompt-editor]");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" EDITMARKER-987");
    await page.click('[data-action="ap-confirm-generate"]');
    await approveFinalRequest(page);
    await page.waitForSelector(".ap-inline-change", { timeout: 15000 });
    assert.equal(apiCalls, 1);
    assert.ok(lastInput.includes("EDITMARKER-987"), "edited prompt text is what gets sent");
    assert.ok(lastInput.includes("Heart failure"));
    assert.ok(!lastInput.includes("Pneumonia"), "edited prompt still excludes other problems");
  });

  await check("suggestions render inline in the plan, track-changes style", async () => {
    const changes = page.locator(".ap-inline-change");
    assert.equal(await changes.count(), 3);
    // Revise shows struck-through anchor + inserted text
    assert.ok(await page.locator(".ap-inline-del").count() >= 2, "revise/remove anchors are struck through");
    assert.ok(await page.locator(".ap-inline-ins").count() >= 2, "add/revise insertions are highlighted");
    // Each change has inline approve/reject
    assert.equal(await page.locator('[data-action="ap-suggestion-approve"]').count(), 3);
    assert.equal(await page.locator('[data-action="ap-suggestion-reject"]').count(), 3);
    // Plan fields are read-only while reviewing
    assert.equal(await page.locator('[data-problem-field="diagnosticPlan"][data-ap-reviewing="true"]').count(), 1);
    assert.ok((await page.locator('.ap-suggestion-refs [data-ap-reference]').count()) >= 1, "citation link is present");
  });

  await check("suggestions survive a full draft-panel re-render", async () => {
    // Changing the note format re-renders the whole draft panel through
    // renderDraft (not the surgical card swap). The pending suggestions
    // must still be there afterwards.
    await page.selectOption("#reviewNoteType", "hp");
    await page.waitForFunction(() => document.querySelectorAll(".ap-inline-change").length === 3);
    await page.selectOption("#reviewNoteType", "progress");
    await page.waitForFunction(() => document.querySelectorAll(".ap-inline-change").length === 3);
  });


  await check("approving the add suggestion appends to the diagnostic plan", async () => {
    await page.locator('[data-action="ap-suggestion-approve"][data-suggestion-id="1"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".ap-inline-change").length === 2);
    const dxPlan = await page.locator(".plan-problem-card").first().locator('[data-problem-field="diagnosticPlan"]').innerText();
    assert.match(dxPlan, /Old test/, "existing plan text is preserved");
    assert.match(dxPlan, /BNP/, "approved addition is appended");
  });

  await check("approving the revise suggestion replaces the anchored text", async () => {
    await page.locator('[data-action="ap-suggestion-approve"][data-suggestion-id="2"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".ap-inline-change").length === 1);
    const txPlan = await page.locator(".plan-problem-card").first().locator('[data-problem-field="therapeuticPlan"]').innerText();
    assert.match(txPlan, /New med 20 mg IV BID/);
    assert.ok(!txPlan.includes("Old med 10 mg PO daily"), "anchored text is replaced, not duplicated");
  });

  await check("rejecting the remove suggestion keeps the differential", async () => {
    await page.locator('[data-action="ap-suggestion-reject"][data-suggestion-id="3"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".ap-inline-change").length === 0);
    const diagnoses = await page.locator(".plan-problem-card").first().locator('[data-differential-field="diagnosis"]').allInnerTexts();
    assert.ok(diagnoses.some((t) => t.includes("Old diagnosis")), "rejected removal leaves the differential in place");
  });

  await check("cancel dismisses the modal without calling the API", async () => {
    const callsBefore = apiCalls;
    await page.locator(".plan-problem-card").nth(1).locator('[data-action="generate-ap"]').click();
    await page.waitForSelector(".ap-confirm-modal");
    await page.locator('[data-ap-request-field="evidenceBased"]').uncheck();
    await page.click('[data-action="ap-confirm-cancel"]');
    assert.equal(await page.locator(".ap-confirm-modal").count(), 0);
    assert.equal(apiCalls, callsBefore, "no API call on cancel");
    assert.equal(await page.locator(".plan-problem-card").nth(1).locator(".ap-inline-change").count(), 0);
  });

  await check("a prominent loading indicator shows while generating", async () => {
    // Delay the mock API so the loading state is observable.
    await page.unroute("https://api.openai.com/v1/responses");
    await page.route("https://api.openai.com/v1/responses", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ output_text: JSON.stringify(mockSuggestions) })
      });
    });
    await page.locator(".plan-problem-card").nth(1).locator('[data-action="generate-ap"]').click();
    await page.waitForSelector(".ap-confirm-modal");
    await page.locator('[data-ap-request-field="evidenceBased"]').uncheck();
    await page.click('[data-action="ap-confirm-generate"]');
    await approveFinalRequest(page);
    // Loading banner appears with spinner and status text
    await page.waitForSelector(".ap-loading-banner", { timeout: 5000 });
    const bannerText = await page.locator(".ap-loading-banner").innerText();
    assert.match(bannerText, /Consult in progress/);
    assert.match(bannerText, /1–2 minutes/);
    assert.equal(await page.locator(".ap-spinner").count(), 1, "spinner is visible");
    // Generate button shows Generating state
    const btnText = await page.locator(".plan-problem-card").nth(1).locator('[data-action="generate-ap"]').innerText();
    assert.match(btnText, /Consulting/);
    // Banner disappears when suggestions arrive
    await page.waitForSelector(".ap-inline-change", { timeout: 15000 });
    assert.equal(await page.locator(".ap-loading-banner").count(), 0, "loading banner is removed after generation");
  });

  await check("approved suggestions include hyperlinked citations in the plan", async () => {
    // The mock suggestion id=1 (add BNP) has citationIds: [1] with a URL.
    // Approve it and verify the citation marker appears as a hyperlink.
    await page.locator('.plan-problem-card').nth(1).locator('[data-action="ap-suggestion-approve"][data-suggestion-id="1"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.plan-problem-card')[1].querySelector('[data-problem-field="diagnosticPlan"]').innerText.includes("BNP"));
    const dxField = page.locator(".plan-problem-card").nth(1).locator('[data-problem-field="diagnosticPlan"]');
    const dxText = await dxField.innerText();
    assert.match(dxText, /BNP/, "approved text is in the plan");
    assert.match(dxText, /\[2\]/, "citation marker is part of the plan text");
    // The marker is rendered as a hyperlink to the source
    const citeLink = dxField.locator('[data-ap-reference]');
    assert.equal(await citeLink.count(), 1, "citation is a hyperlink");
    assert.equal(await citeLink.innerText(), "[2]");
    await citeLink.hover();
    assert.match(await page.locator(".ap-source-preview").innerText(), /Synthetic test excerpt/);
    if (process.env.CITATION_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.CITATION_SCREENSHOT_DIR}/citation-hover.png`});
    await citeLink.click();
    assert.equal(await page.locator(".ap-source-dialog[open]").count(), 1);
    assert.match(await page.locator(".ap-source-dialog").innerText(), /Synthetic section 4/);
    assert.match(await page.locator(".ap-source-dialog a").getAttribute("href"), /ahajournals/);
    if (process.env.CITATION_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.CITATION_SCREENSHOT_DIR}/citation-details.png`});
    await page.keyboard.press("Escape");
  });

  await check("approved citation passages survive encrypted save and reload", async () => {
    await page.waitForFunction(() => ["saved", "idle"].includes(document.querySelector("[data-autosave-indicator]")?.dataset.state));
    await page.reload();
    await page.fill("#vaultPassphrase", "clinical review test passphrase");
    await page.click('[data-action="unlock-vault"]');
    await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
    await navigateToView(page, "review");
    const marker = page.locator('.plan-problem-card').nth(1).locator('[data-problem-field="diagnosticPlan"] [data-ap-reference]');
    await marker.click();
    assert.match(await page.locator('.ap-source-dialog').innerText(), /Synthetic test excerpt/);
    await page.keyboard.press("Escape");
    await page.locator('.ap-source-dialog').waitFor({state:'detached'});
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('Synthetic test excerpt')), false);
  });

  await check("no JS errors", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  });
} finally {
  await browser.close();
  await server.close();
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n=== AP SUGGESTIONS E2E PASSED ===");
