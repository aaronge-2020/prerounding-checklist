import assert from "node:assert/strict";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";
import { installSyntheticDeid } from "./browser/external-ai-fixture.js";

const server = await createAppServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await installSyntheticDeid(page);
  const externalRequests = [];
  page.on("request", request => { if (/api.openai.com|openrouter.ai|huggingface.co/.test(request.url())) externalRequests.push(request.url()); });
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.evaluate(async () => {
    const { openLocalNoteSynthesis } = await import("/src/ui/local-note-synthesis.js?v=20261015-clinical-drafts");
    const { writeLocalLlmSettings } = await import("/src/local-llm/client.js?v=20261015-stable-draft-runtime");
    writeLocalLlmSettings({ selectedModelKey: "" });
    const listeners = new Set();
    let state = { status: "idle", verified: false, activeModelKey: "" };
    let rejectLoad;
    const emit = () => { for (const listener of listeners) listener(state); };
    globalThis.__modelLoadCalls = [];
    globalThis.__draftApplied = null;
    const client = {
      getStatus: () => state,
      onStatusChange: callback => { listeners.add(callback); return () => listeners.delete(callback); },
      ensureReady: key => new Promise((resolve, reject) => {
        globalThis.__modelLoadCalls.push(key); rejectLoad = reject;
        state = { status: "loading", verified: false, activeModelKey: key, progress: 0.4, progressText: "Downloading model files: 40%" }; emit();
        globalThis.__completeModelLoad = success => {
          rejectLoad = null;
          state = { ...state, status: success ? "ready" : "error", verified: success, progress: 1 }; emit();
          if (success) resolve(state); else reject(new Error("Synthetic model verification failed"));
        };
      }),
      unload: async () => {
        state = { status: "idle", verified: false, activeModelKey: "" }; emit();
        rejectLoad?.(new DOMException("Cancelled", "AbortError")); rejectLoad = null;
      },
      resetChat: async () => {},
      countTokens: async texts => texts.map(text => Math.ceil(text.length / 2)), chat: async messages => JSON.stringify(messages[0].content.includes("ONE-LINER CONTRACT") ? { baseline_ids: [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]).slice(0, 1), history_ids: [], uncertainty_ids: [] } : messages[0].content.startsWith("Select up to three") ? { questions: [] } : { selected_ids: [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]).slice(0, messages[1].content.includes("Select at most 2 IDs") ? 2 : 3) })
    };
    openLocalNoteSynthesis({ source: "Historical source: prior symptom. Current status not documented.", sources: [{ id: "imported", label: "Imported note + selected results", text: "Historical source: prior symptom. Current status not documented." }, { id: "working", label: "Current working draft (includes edits)", text: "Explicit clinician edit in working draft." }], client,
      hardwareReport: async () => ({ facts: {}, gpu: { available: true, shaderF16: true, adapterDescription: "Synthetic adapter" }, storageAvailableMB: 20000 }),
      stillCurrent: () => true, apply: (section, text) => { globalThis.__draftApplied = { section, text }; }, copy: async () => {}
    });
  });
  const picker = page.locator("[data-local-model-select]");
  await picker.locator("option").first().waitFor({ state: "attached" });
  assert.equal(await picker.locator("option").count(), 5);
  assert.equal(await picker.inputValue(), "qwen3.5-2b");
  assert.equal(await page.locator("[data-local-generate]").isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => globalThis.__modelLoadCalls), [], "opening the dialog never downloads a model");
  await page.getByText("Known GPU or unified memory (optional)", { exact: true }).click();
  await page.locator("[data-local-memory-gb]").fill("12");
  assert.equal(await picker.inputValue(), "qwen3.5-4b", "known 12GB dedicated GPU suggests the dense-evaluated drafting model");
  assert.equal(await picker.locator('[value="qwen3.5-9b"]').count(), 0, "failed drafting model is excluded instead of offered as runnable");
  await page.locator("[data-local-memory-kind]").selectOption("unified");
  await page.locator("[data-local-memory-gb]").fill("8");
  assert.equal(await picker.inputValue(), "qwen3.5-4b", "unified memory reserves more headroom");
  assert.equal(await picker.locator('[value="qwen3.5-9b"]').count(), 0);
  await page.locator("[data-local-memory-kind]").selectOption("dedicated");
  await page.locator("[data-local-memory-gb]").fill("12");
  await page.getByText("Known GPU or unified memory (optional)", { exact: true }).click();
  await page.locator("[data-local-model-load]").click();
  assert.equal(await page.locator("[data-local-generate]").isDisabled(), true);
  assert.match(await page.locator("[data-local-model-status]").textContent(), /40%/);
  await page.evaluate(() => globalThis.__completeModelLoad(false));
  await page.getByText("Synthetic model verification failed", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-local-generate]").isDisabled(), true);
  await page.locator("[data-local-model-load]").click();
  await page.evaluate(() => globalThis.__completeModelLoad(true));
  await page.locator("[data-local-generate]:enabled").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-local-context-budget]")?.textContent.includes("model tokenizer"));
  const sourceEditor = page.getByRole("textbox", { name: "Reviewed source material", exact: true });
  const originalSource = await sourceEditor.inputValue();
  await sourceEditor.fill(Array.from({ length: 600 }, (_, index) => `Archived sentence ${index}: source context from a previous visit, with no new clinical updates.`).join("\n"));
  assert.match(await page.locator("[data-local-context-budget]").textContent(), /[2-9] source passes/, "long input gets a visible multi-pass plan rather than a whole-note context rejection");
  assert.ok(await page.locator("[data-local-context-bar]").evaluate(node => node.value <= 1));
  await page.getByRole("combobox", { name: "Chart representation", exact: true }).selectOption("working");
  assert.equal(await sourceEditor.inputValue(), "Explicit clinician edit in working draft.");
  await page.getByRole("combobox", { name: "Chart representation", exact: true }).selectOption("imported");
  assert.equal(await sourceEditor.inputValue(), originalSource);
  await page.getByText("Information obtained today (optional)", { exact: true }).click();
  await page.getByRole("textbox", { name: "Updates obtained today", exact: true }).fill("Home blood pressure reported today: 146/88 mmHg.");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("[data-local-note-synthesis]").evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: join(tmpdir(), "preround-draft-model-controls-mobile.png") });
  await page.locator("[data-local-generate]").click();
  await page.locator("[data-local-apply]:enabled").waitFor();
  assert.match(await page.getByRole("textbox", { name: "Proposed note text", exact: true }).inputValue(), /146\/88 mmHg/, "explicit current updates survive model selection");
  await page.locator("[data-local-model-controls] > summary").click();
  await picker.selectOption("qwen3.5-2b");
  assert.ok(await page.getByText(/this model missed useful excerpts/).isVisible());
  assert.equal(await page.locator("[data-local-apply]").isDisabled(), true, "switching models invalidates the old draft");
  assert.equal(await page.locator("[data-local-generate]").isDisabled(), true);
  await page.locator("[data-local-model-load]").click();
  await page.locator("[data-local-model-cancel]").click();
  await page.getByText("Model load cancelled. Cached downloads are retained.", { exact: true }).waitFor();
  await page.locator("[data-local-model-load]").click();
  await page.evaluate(() => globalThis.__completeModelLoad(true));
  await page.locator("[data-local-generate]").click();
  await page.locator("[data-local-apply]:enabled").waitFor();
  await page.locator("[data-local-apply]").click();
  assert.match((await page.evaluate(() => globalThis.__draftApplied)).text, /Historical source: prior symptom/);
  assert.equal(await page.locator("[data-local-note-synthesis]").count(), 0);
  assert.deepEqual(externalRequests, [], "deterministic UI transport test makes no provider/model download requests");
  console.log("Draft model controls: picker, hardware suggestions, explicit load, progress, self-test gating, retry, cancellation, mobile and draft invalidation passed.");
} finally { await browser.close(); await server.close(); }
