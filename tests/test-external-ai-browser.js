import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";
import { installSyntheticDeid, approveFinalRequest } from "./browser/external-ai-fixture.js";
const server = await createAppServer();
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ["--no-proxy-server"] });
try {
  const page = await browser.newPage({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => console.error("Synthetic browser error:", error.message));
  await installSyntheticDeid(page);
  let calls = [];
  await page.route("https://api.openai.com/v1/responses", async route => {
    calls.push(JSON.parse(route.request().postData()));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: "resp_synthetic", object: "response", created_at: 1, status: "completed", model: "test",
      output_text: "Synthetic response",
      output: [{ id: "msg_synthetic", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Synthetic response", annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
    }) });
  });
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  const start = async (body = { model: "test", instructions: "Synthetic Person instructions", input: "Synthetic Person question" }, literatureOnly = false) => {
    await page.evaluate(async ({ body, literatureOnly }) => {
      const { reviewedAiFetch } = await import("/src/ui/external-ai-review.js?v=20261015-simple-review");
      globalThis.__privacyResult = "pending";
      void reviewedAiFetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), literatureOnly }).then(() => { globalThis.__privacyResult = "sent"; }, () => { globalThis.__privacyResult = "blocked"; });
    }, { body, literatureOnly });
  };
  await start();
  await page.locator("[data-external-ai-review]").waitFor();
  assert.equal(calls.length, 0);
  assert.equal(await page.locator("[data-external-send]").isDisabled(), true);
  await page.waitForFunction(() => /Scan complete|scan failed/.test(document.querySelector("[data-external-review-status]")?.textContent || ""));
  assert.match(await page.locator("[data-external-review-status]").textContent(), /^Scan complete/);
  assert.ok(!(await page.locator("[data-external-request-preview]").textContent()).includes("Synthetic Person"));
  assert.equal(await page.locator('[data-external-group="instructions"]').getAttribute("open"), null, "technical instructions start collapsed");
  assert.equal(await page.locator('[data-external-field="input"]').isVisible(), true, "actual request stays visible");
  assert.match(await page.locator('[data-external-group="instructions"] summary').textContent(), /updated locally/, "changed supporting text is clearly marked");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('[data-external-ai-review]').evaluate(node => node.scrollWidth <= node.clientWidth), true, "mobile review has no horizontal overflow");
  await page.screenshot({ path: join(tmpdir(), "preround-external-ai-review-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(tmpdir(), "preround-external-ai-review.png") });
  await page.locator("[data-external-reviewed]").check();
  await page.locator("[data-external-permitted]").check();
  await page.locator('[data-external-field="input"]').fill("New Synthetic Person question");
  assert.equal(await page.locator("[data-external-send]").isDisabled(), true);
  assert.equal(await page.locator("[data-external-reviewed]").isChecked(), false);
  assert.equal(calls.length, 0);
  await approveFinalRequest(page);
  await page.waitForFunction(() => globalThis.__privacyResult === "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "New [NAME] question");
  assert.equal(calls[0].instructions, "[NAME] instructions");
  assert.equal(calls[0].store, false);
  assert.equal(await page.locator("[data-external-ai-review]").count(), 0);
  await start();
  await page.evaluate(() => { globalThis.__privacyScanFails = true; });
  await page.locator("[data-external-scan]").click();
  await page.waitForFunction(() => /scan failed/.test(document.querySelector("[data-external-review-status]")?.textContent || ""));
  assert.equal(await page.locator("[data-external-send]").isDisabled(), true);
  assert.equal(calls.length, 1);
  await page.locator("[data-external-cancel]").click();
  await page.evaluate(() => { globalThis.__privacyScanFails = false; });
  await start({ model: "test", input: "Patient chart", tools: [{ type: "web_search" }] });
  await page.waitForFunction(() => globalThis.__privacyResult === "blocked");
  assert.equal(calls.length, 1);
  await start({ model: "test", input: "General question", tools: [{ type: "web_search" }] }, true);
  await approveFinalRequest(page);
  await page.waitForFunction(() => globalThis.__privacyResult === "sent");
  assert.equal(calls.length, 2);
  assert.equal(typeof calls[1].input, "string");
  await page.evaluate(async () => {
    const { requestOpenAiChatWithUsage } = await import("/src/ui/openai-client.js?v=20261015-simple-review");
    globalThis.__privacyResult = "pending";
    void requestOpenAiChatWithUsage({ apiKey: "synthetic-key", model: "test", input: [{ role: "system", content: "Synthetic Person preference" }, { role: "user", content: "Synthetic Person question" }] }).then(() => { globalThis.__privacyResult = "sent"; });
  });
  await page.locator("[data-external-ai-review]").waitFor();
  assert.equal(calls.length, 2, "the actual chat client cannot bypass review");
  await approveFinalRequest(page);
  await page.waitForFunction(() => globalThis.__privacyResult === "sent");
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(calls[2]).includes("Synthetic Person"));
  assert.ok(!(await page.locator("body").textContent()).includes("synthetic-key"));
  await page.evaluate(async () => {
    const { runAgent } = await import("/src/ai/agent-runner.js?v=20260929-agent-runner-v2");
    const { reviewedAiFetch } = await import("/src/ui/external-ai-review.js?v=20261015-simple-review");
    globalThis.__privacyResult = "pending";
    void runAgent({ apiKey: "synthetic-key", model: "gpt-4.1-mini", messages: [{ role: "user", content: "Synthetic Person question" }], tools: {}, fetchImpl: reviewedAiFetch }).then(() => { globalThis.__privacyResult = "sent"; }, error => { globalThis.__privacyResult = `failed:${error.message}`; });
  });
  await page.waitForFunction(() => document.querySelector("[data-external-ai-review]") || globalThis.__privacyResult.startsWith("failed:"));
  assert.equal(await page.evaluate(() => globalThis.__privacyResult), "pending", "SDK requests must reach the review boundary");
  assert.equal(calls.length, 3);
  await approveFinalRequest(page);
  await page.waitForFunction(() => globalThis.__privacyResult !== "pending");
  assert.equal(await page.evaluate(() => globalThis.__privacyResult), "sent");
  assert.equal(calls.length, 4);
  assert.ok(!JSON.stringify(calls[3]).includes("Synthetic Person"));
  assert.equal(calls[3].store, false);
  await page.evaluate(async () => {
    const { openLocalNoteSynthesis } = await import("/src/ui/local-note-synthesis.js?v=20261015-tokenized-drafts");
    globalThis.__localApplied = null;
    openLocalNoteSynthesis({
      hardwareReport: async () => ({ facts: {}, gpu: { available: true, shaderF16: true } }),
      source: "Historical source: Synthetic Person had a symptom. Current updates: not documented.",
      stillCurrent: () => true,
      apply: (section, text) => { globalThis.__localApplied = { section, text }; }, copy: async () => {},
      client: { getStatus: () => ({ status: "ready", verified: true, activeModelKey: "qwen3-4b" }), resetChat: async () => {}, countTokens: async texts => texts.map(text => Math.ceil(text.length / 2)), chat: async messages => JSON.stringify(messages[0].content.startsWith("Select up to three") ? { questions: [] } : { selected_ids: [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]).slice(0, messages[1].content.includes("Select at most 2 IDs") ? 2 : 3) }) }
    });
  });
  await page.locator("[data-local-generate]").click();
  await page.locator("[data-local-apply]:enabled").waitFor();
  await page.getByRole("textbox", { name: "Reviewed source material" }).fill("Updated source: current status not documented.");
  assert.equal(await page.locator("[data-local-apply]").isDisabled(), true, "editing local source invalidates the generated draft");
  await page.locator("[data-local-generate]").click();
  await page.locator("[data-local-apply]:enabled").waitFor();
  await page.screenshot({ path: join(tmpdir(), "preround-local-note-synthesis.png") });
  assert.equal(calls.length, 4, "local synthesis makes no external AI calls");
  await page.locator("[data-local-apply]").click();
  const applied = await page.evaluate(() => globalThis.__localApplied);
  assert.equal(applied.section, "one_liner");
  assert.ok(!applied.text.includes("Synthetic Person"));
  assert.match(applied.text, /current status not documented/);
  await start();
  await page.locator("[data-external-ai-review]").waitFor();
  await page.evaluate(async () => { const network = await import("/src/lib/network-gate.js?v=20261012-safety"); network.setOfflineMode(true); });
  await page.waitForFunction(() => globalThis.__privacyResult === "blocked");
  assert.equal(calls.length, 4, "offline transition cancels pending approval");
  await page.evaluate(async () => { const network = await import("/src/lib/network-gate.js?v=20261012-safety"); network.setOfflineMode(false); });
  await page.evaluate(async () => {
    // A warning in a supporting field must be visible, even when that section
    // normally starts collapsed. No external endpoint is invoked here.
    const { reviewExternalAiRequest } = await import("/src/ui/external-ai-review.js?v=20261015-simple-review");
    void reviewExternalAiRequest("https://api.openai.com/v1/responses", { model: "test", instructions: "Review this", input: [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier reply" }, { role: "user", content: "Current question" }] }, { ensureReady: async () => {}, deidentify: async text => ({ text, modelId: "synthetic-test", residualWarnings: text === "Review this" ? [{ message: "Inspect instructions" }] : [] }) }).catch(error => { globalThis.__warningReviewCancelled = error.name; });
  });
  await page.waitForFunction(() => document.querySelector("[data-external-review-status]")?.textContent.startsWith("Scan complete."));
  assert.equal(await page.locator('[data-external-group="instructions"]').getAttribute("open"), "", "warning section opens automatically");
  assert.equal(await page.locator('[data-external-group="history"]').getAttribute("open"), null, "earlier conversation stays available without crowding the question");
  assert.match(await page.locator('[data-external-review-status]').textContent(), /Inspect instructions/);
  await page.locator('[data-external-cancel]').click();
  assert.equal(calls.length, 4);
  await start();
  await page.locator("[data-external-ai-review]").waitFor();
  await page.evaluate(() => document.querySelector('[data-action="lock-vault"]').click());
  await page.waitForFunction(() => globalThis.__privacyResult === "blocked");
  assert.equal(await page.locator("[data-external-ai-review]").count(), 0);
  assert.ok(!(await page.locator("body").textContent()).includes("Synthetic Person"));
  assert.equal(calls.length, 4);
  console.log("PASS: real browser boundary: no pre-approval transmission, final edits rescanned, failures blocked, web search isolated, lock clears review.");
} finally { await browser.close(); await server.close(); }
