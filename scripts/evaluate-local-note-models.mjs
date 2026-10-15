// Real browser/WebGPU evaluation. Explicitly invoked; never part of normal CI.
// All inputs are synthetic. Save a checkpoint after each completed case.
import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scoreLocalNoteCase } from "../tests/fixtures/local-note-eval-score.js?v=20261015-tokenized-drafts";
import { createAppServer, unlockAndCreatePatient } from "../tests/browser/app-harness.js";

const modelKey = process.argv[2] || "qwen3.5-9b";
const directory = "reports";
const phase = process.argv.includes("--ui-only") ? "ui-only" : process.argv.includes("--dev") ? "development" : process.argv.includes("--smoke") ? "smoke" : "fixed-evaluation";
const checkpoint = `${directory}/note-model-${modelKey}-${phase}.json`;
await mkdir(directory, { recursive: true });
const report = { modelKey, phase, syntheticOnly: true, startedAt: new Date().toISOString(), stages: [], cases: [] };
let saves = Promise.resolve();
const save = () => { const snapshot = JSON.stringify(report, null, 2); saves = saves.then(() => writeFile(checkpoint, snapshot)); return saves; };
for (const file of ["src/local-llm/note-synthesis.js", "src/local-llm/models.js", "src/local-llm/client.js", "src/local-llm/worker.js", "src/local-llm/tokenizer.js", "src/ui/local-note-synthesis.js", "tests/fixtures/local-note-eval.js"]) { report.hashes ||= {}; report.hashes[file] = createHash("sha256").update(await readFile(file)).digest("hex"); }
const server = await createAppServer({ crossOriginIsolated: true, port: 41789 });
const browser = await chromium.launchPersistentContext("tmp/local-note-eval-edge", { channel: "msedge", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
try {
  const page = await browser.newPage();
  report.browser = browser.browser().version();
  const externalWrites = [];
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(server.baseUrl) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) externalWrites.push({ url: request.url(), method: request.method() }); });
  page.on("pageerror", error => console.error("Browser:", error.message));
  await page.exposeFunction("noteEvalProgress", async event => {
    report.lastProgress = { ...event, at: new Date().toISOString() };
    await save();
    if (event.phase !== "loading" || event.progress === 1) console.log(JSON.stringify(event));
  });
  await page.goto(server.baseUrl);
  await page.waitForSelector("#vaultPassphrase");
  report.hardware = await page.evaluate(async () => {
    const { getLocalLlmHardwareReport } = await import("/src/local-llm/client.js?v=20261015-tokenized-drafts");
    return getLocalLlmHardwareReport();
  });
  await save();
  if (!report.hardware.gpu?.available) throw new Error("No real WebGPU adapter is available.");
  const started = Date.now();
  await page.evaluate(async key => {
    const { sharedLocalLlmClient } = await import("/src/local-llm/client.js?v=20261015-tokenized-drafts");
    const client = sharedLocalLlmClient();
    globalThis.__noteEvaluationClient = client;
    await client.ensureReady(key, { onProgress: event => { void globalThis.noteEvalProgress({ phase: "loading", ...event }); } });
  }, modelKey);
  report.loadMs = Date.now() - started;
  report.stages.push("real browser model loaded and instruction self-test passed");
  await save();
  console.log(`Loaded ${modelKey} in ${report.loadMs} ms`);
  // --smoke allows checking artifacts/runtime before the full pipeline run.
  if (!process.argv.includes("--smoke")) {
    const { LOCAL_NOTE_EVAL_CASES, LOCAL_NOTE_DEV_CASES } = await import("../tests/fixtures/local-note-eval.js");
    for (const fixture of process.argv.includes("--ui-only") ? [] : process.argv.includes("--dev") ? LOCAL_NOTE_DEV_CASES : LOCAL_NOTE_EVAL_CASES) {
      const result = await page.evaluate(async fixture => {
        const { synthesizeLocalNote } = await import("/src/local-llm/note-synthesis.js?v=20261015-tokenized-drafts");
        const start = performance.now();
        const modelOutputs = [];
        try {
          const draft = await synthesizeLocalNote(globalThis.__noteEvaluationClient, fixture, { onProgress: event => { void globalThis.noteEvalProgress(event); }, onModelOutput: event => modelOutputs.push(event) });
          return { id: fixture.id, elapsedMs: performance.now() - start, modelOutputs, ...draft };
        } catch (error) { return { id: fixture.id, elapsedMs: performance.now() - start, modelOutputs, error: error.message }; }
      }, fixture);
      if (!process.argv.includes("--dev")) result.score = scoreLocalNoteCase(fixture, result);
      report.cases.push(result); await save();
      console.log(JSON.stringify(result));
    }
    if (!process.argv.includes("--dev")) {
      report.summary = { passed: report.cases.filter(result => result.score.passed).length, total: report.cases.length };
      if (report.summary.passed !== report.summary.total) process.exitCode = 1;
      // Actual dialog -> real WebGPU model -> actual Stanford local de-id ->
      // preview/explicit Apply. This is synthetic and does not save a chart.
      const fixture = LOCAL_NOTE_EVAL_CASES.find(item => item.id === "bp-old-new-conflict");
      await unlockAndCreatePatient(page);
      await page.evaluate(async fixture => {
        const { openLocalNoteSynthesis } = await import("/src/ui/local-note-synthesis.js?v=20261015-tokenized-drafts");
        globalThis.__noteUiApplied = null;
        openLocalNoteSynthesis({ source: fixture.source, stillCurrent: () => true, apply: (section, text) => { globalThis.__noteUiApplied = { section, text }; }, copy: async () => {} });
      }, fixture);
      await page.getByRole("textbox", { name: "Visit focus", exact: true }).fill(fixture.visitReason);
      await page.getByRole("combobox", { name: "Section to draft", exact: true }).selectOption(fixture.section);
      await page.getByText("Information obtained today (optional)", { exact: true }).click();
      await page.getByRole("textbox", { name: "Updates obtained today", exact: true }).fill(fixture.todayUpdates);
      await page.locator("[data-local-generate]:enabled").waitFor();
      await page.waitForFunction(() => document.querySelector("[data-local-context-budget]")?.textContent.includes("model tokenizer"));
      report.uiContextMeter = await page.locator("[data-local-context-budget]").textContent();
      await page.locator("[data-local-generate]").click();
      await page.waitForFunction(() => !document.querySelector("[data-local-apply]")?.disabled || /failed|No draft|No usable|unverified|invalid|unsupported|Verify the local/.test(document.querySelector("[data-local-draft-status]")?.textContent || ""), {}, { timeout: 180000 });
      report.uiStatus = await page.locator("[data-local-draft-status]").textContent();
      report.uiFinalContextMeter = await page.locator("[data-local-context-budget]").textContent();
      await page.screenshot({ path: `${directory}/draft-${modelKey}.png`, fullPage: true });
      report.uiDraft = await page.getByRole("textbox", { name: "Proposed note text", exact: true }).inputValue();
      if (await page.locator("[data-local-apply]").isDisabled() || !report.uiDraft.includes("164/96 mmHg") || /<\/?think>/.test(report.uiDraft)) throw new Error("Real model/de-identification UI preview did not pass its source-fidelity check.");
      await page.locator("[data-local-apply]").click();
      report.uiApplied = await page.evaluate(() => globalThis.__noteUiApplied);
      if (!report.uiApplied?.text?.includes("164/96 mmHg")) throw new Error("The explicit Apply action did not receive the reviewed draft.");
      report.externalWrites = externalWrites;
      if (externalWrites.length) throw new Error("An unexpected external write occurred during local evaluation.");
    }
  }
} catch (error) { report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { report.finishedAt = new Date().toISOString(); await save(); await browser.close(); await server.close(); }
