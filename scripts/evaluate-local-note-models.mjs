// Real browser/WebGPU evaluation. Explicitly invoked; never part of normal CI.
// All inputs are synthetic. Save a checkpoint after each completed case.
import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scoreLocalNoteCase } from "../tests/fixtures/local-note-eval-score.js?v=20261015-clinical-drafts";
import { createAppServer, unlockAndCreatePatient } from "../tests/browser/app-harness.js";

const modelKey = process.argv[2] || "qwen3.5-9b";
const directory = "reports";
const dense = process.argv.includes("--dense") || process.argv.includes("--dense-dev");
const development = process.argv.includes("--dev") || process.argv.includes("--dense-dev");
const phase = dense && process.argv.includes("--ui-only") ? "dense-ui-only" : dense ? development ? "dense-development" : "dense-fixed" : process.argv.includes("--ui-only") ? "ui-only" : process.argv.includes("--dev") ? "development" : process.argv.includes("--smoke") ? "smoke" : "fixed-evaluation";
const label = process.argv.includes("--label") ? process.argv[process.argv.indexOf("--label") + 1] : "";
const checkpoint = `${directory}/note-model-${modelKey}-${phase}${label ? "-" + label : ""}.json`;
await mkdir(directory, { recursive: true });
const report = { modelKey, phase, label, syntheticOnly: true, workerLifetime: "verified fresh worker per case; refreshed after at most eight inference calls; UI close releases worker", startedAt: new Date().toISOString(), stages: [], cases: [] };
let saves = Promise.resolve();
const save = () => { const snapshot = JSON.stringify(report, null, 2); saves = saves.then(() => writeFile(checkpoint, snapshot)); return saves; };
for (const file of ["src/local-llm/note-synthesis.js", "src/local-llm/models.js", "src/local-llm/client.js", "src/local-llm/worker.js", "src/local-llm/tokenizer.js", "src/local-llm/operation-queue.js", "vendor/web-llm/index.js", "src/local-llm/note-source.js", "src/local-llm/draft-privacy-review.js", "src/ui/local-draft-privacy-review.js", "src/ui/local-note-synthesis.js", "src/ui/local-model-controls.js", "tests/fixtures/local-note-eval.js", "tests/fixtures/local-note-dense-eval.js", "tests/fixtures/local-note-eval-score.js"]) { report.hashes ||= {}; report.hashes[file] = createHash("sha256").update(await readFile(file)).digest("hex"); }
if (process.argv.includes("--resume")) {
  const previous = JSON.parse(await readFile(checkpoint, "utf8"));
  const currentHashes = report.hashes;
  const generationMatches = Object.entries(currentHashes).filter(([path]) => !path.startsWith("src/ui/")).every(([path, hash]) => previous.hashes?.[path] === hash);
  if (previous.modelKey !== modelKey || previous.phase !== phase || !generationMatches) throw new Error("Checkpoint does not match generation code and fixtures. Use a new label for changed generation code.");
  Object.assign(report, previous, { hashes: currentHashes, previousUiHashes: Object.fromEntries(Object.entries(previous.hashes).filter(([path]) => path.startsWith("src/ui/"))), resumedAt: new Date().toISOString(), error: undefined, finishedAt: undefined });
}
const server = await createAppServer({ crossOriginIsolated: true, port: 41789 });
const browser = await chromium.launchPersistentContext("tmp/local-note-eval-edge", { channel: "msedge", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
try {
  const page = await browser.newPage();
  report.browser = browser.browser().version();
  const externalWrites = [];
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(server.baseUrl) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) externalWrites.push({ url: request.url(), method: request.method() }); });
  page.on("pageerror", error => console.error("Browser:", error.message));
  page.on("console", message => { if (message.type() === "error") { report.runtimeErrors ||= []; report.runtimeErrors.push(message.text().slice(0, 1500)); void save(); } });
  const reviewSyntheticPrivacy = async () => {
    await page.waitForFunction(() => ["review", "error"].includes(document.querySelector("[data-local-note-synthesis]")?.dataset.localDraftState), {}, { timeout: 480000 });
    if (await page.locator("[data-local-note-synthesis]").getAttribute("data-local-draft-state") === "error") throw new Error(await page.locator("[data-local-draft-status]").textContent());
    const decisions = [];
    while (await page.locator('[data-local-privacy-state="pending"] [data-local-privacy-decision="confirmed"]').count()) {
      const keep = page.locator('[data-local-privacy-state="pending"] [data-local-privacy-decision="confirmed"]').first();
      const original = (await keep.getAttribute("aria-label")).slice("Keep redaction: ".length);
      const restore = ["G6P2032", "G5P2032"].includes(original);
      await page.locator(`[data-local-privacy-decision="${restore ? "restored" : "confirmed"}"][data-local-privacy-index="${await keep.getAttribute("data-local-privacy-index")}"]`).click();
      decisions.push({ original, decision: restore ? "clinician simulation: not PHI" : "keep redaction" });
    }
    return decisions;
  };
  await page.exposeFunction("noteEvalProgress", async event => {
    report.lastProgress = { ...event, at: new Date().toISOString() };
    await save();
    if (event.phase !== "loading" || event.progress === 1) console.log(JSON.stringify(event));
  });
  await page.goto(server.baseUrl);
  await page.waitForSelector("#vaultPassphrase");
  report.hardware = await page.evaluate(async () => {
    const { getLocalLlmHardwareReport } = await import("/src/local-llm/client.js?v=20261015-stable-draft-runtime");
    return getLocalLlmHardwareReport();
  });
  await save();
  if (!report.hardware.gpu?.available) throw new Error("No real WebGPU adapter is available.");
  const started = Date.now();
  await page.evaluate(async key => {
    const { sharedLocalLlmClient } = await import("/src/local-llm/client.js?v=20261015-stable-draft-runtime");
    const client = sharedLocalLlmClient();
    globalThis.__noteEvaluationClient = client;
    globalThis.__noteEvaluationKey = key;
    await client.ensureReady(key, { onProgress: event => { void globalThis.noteEvalProgress({ phase: "loading", ...event }); } });
  }, modelKey);
  report.loadMs = Date.now() - started;
  report.stages.push("real browser model loaded and instruction self-test passed");
  await save();
  console.log(`Loaded ${modelKey} in ${report.loadMs} ms`);
  // --smoke allows checking artifacts/runtime before the full pipeline run.
  if (!process.argv.includes("--smoke")) {
    const { LOCAL_NOTE_EVAL_CASES, LOCAL_NOTE_DEV_CASES } = await import("../tests/fixtures/local-note-eval.js");
    const denseCases = dense ? await import("../tests/fixtures/local-note-dense-eval.js") : null;
    const cases = dense ? development ? denseCases.LOCAL_NOTE_DENSE_DEV_CASES : denseCases.LOCAL_NOTE_DENSE_EVAL_CASES : development ? LOCAL_NOTE_DEV_CASES : LOCAL_NOTE_EVAL_CASES;
    const requestedIds = process.argv.includes("--case") ? process.argv[process.argv.indexOf("--case") + 1].split(",") : [];
    if (requestedIds.some(id => !cases.some(item => item.id === id))) throw new Error("Unknown evaluation case ID.");
    report.requestedCaseIds = requestedIds;
    const selectedCases = process.argv.includes("--ui-only") ? [] : cases.filter(item => !requestedIds.length || requestedIds.includes(item.id));
    if (!process.argv.includes("--ui-only") && !selectedCases.length) throw new Error("No evaluation cases matched. Check the case ID.");
    for (const fixture of selectedCases) {
      if (report.cases.some(result => result.id === fixture.id)) continue;
      const result = await page.evaluate(async fixture => {
        const { synthesizeLocalNote } = await import("/src/local-llm/note-synthesis.js?v=20261015-clinical-drafts");
        const start = performance.now();
        const modelOutputs = [];
        try {
          await globalThis.__noteEvaluationClient.ensureReady(globalThis.__noteEvaluationKey);
          const draft = await synthesizeLocalNote(globalThis.__noteEvaluationClient, fixture, { onProgress: event => { void globalThis.noteEvalProgress(event); }, onModelOutput: event => modelOutputs.push(event) });
          return { id: fixture.id, elapsedMs: performance.now() - start, modelOutputs, ...draft };
        } catch (error) { return { id: fixture.id, elapsedMs: performance.now() - start, modelOutputs, error: error.message }; }
        finally { await globalThis.__noteEvaluationClient.unload(); }
      }, fixture);
      if (!development) result.score = scoreLocalNoteCase(fixture, result);
      report.cases.push(result); await save();
      console.log(JSON.stringify(result));
    }
    if (!development) {
      report.summary = { passed: report.cases.filter(result => result.score.passed).length, total: report.cases.length };
      if (report.summary.passed !== report.summary.total) process.exitCode = 1;
      // Actual dialog -> real WebGPU model -> actual Stanford local de-id ->
      // preview/explicit Apply. This is synthetic and does not save a chart.
      const longUi = dense && !process.argv.includes("--quick-ui");
      report.uiScope = longUi ? "dense table-only HPI plus baseline-focused one-liner" : "short HPI plus baseline-focused one-liner when dense";
      const fixture = longUi ? denseCases.LOCAL_NOTE_DENSE_EVAL_CASES.find(item => item.id === "dense-table-only-result-fresh") : LOCAL_NOTE_EVAL_CASES.find(item => item.id === "bp-old-new-conflict");
      await unlockAndCreatePatient(page);
      await page.evaluate(async fixture => {
        const { openLocalNoteSynthesis } = await import("/src/ui/local-note-synthesis.js?v=20261015-clinical-drafts");
        await globalThis.__noteEvaluationClient.ensureReady(globalThis.__noteEvaluationKey);
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
      report.uiPrivacyDecisions = await reviewSyntheticPrivacy();
      report.uiStatus = await page.locator("[data-local-draft-status]").textContent();
      report.uiFinalContextMeter = await page.locator("[data-local-context-budget]").textContent();
      await page.screenshot({ path: `${directory}/draft-${modelKey}.png`, fullPage: true });
      report.uiDraft = await page.getByRole("textbox", { name: "Proposed note text", exact: true }).inputValue();
      if (await page.locator("[data-local-apply]").isDisabled() || (longUi ? fixture.expected.prior.some(term => !report.uiDraft.includes(term)) : !report.uiDraft.includes("164/96 mmHg")) || /<\/?think>/.test(report.uiDraft)) throw new Error("Real model/de-identification UI preview did not pass its source-fidelity check.");
      await page.locator("[data-local-apply]").click();
      report.uiApplied = await page.evaluate(() => globalThis.__noteUiApplied);
      if (!report.uiApplied?.text || (longUi ? fixture.expected.prior.some(term => !report.uiApplied.text.includes(term)) : !report.uiApplied.text.includes("164/96 mmHg"))) throw new Error("The explicit Apply action did not receive the reviewed draft.");
      if (dense) {
        const one = denseCases.LOCAL_NOTE_DENSE_DEV_CASES[0];
        await page.evaluate(async fixture => {
          const { openLocalNoteSynthesis } = await import("/src/ui/local-note-synthesis.js?v=20261015-clinical-drafts");
          await globalThis.__noteEvaluationClient.ensureReady(globalThis.__noteEvaluationKey);
        globalThis.__noteUiApplied = null;
          openLocalNoteSynthesis({ source: fixture.source, stillCurrent: () => true, apply: (section, text) => { globalThis.__noteUiApplied = { section, text }; }, copy: async () => {} });
        }, one);
        await page.getByRole("textbox", { name: "Visit focus", exact: true }).fill(one.visitReason);
        await page.locator("[data-local-generate]:enabled").waitFor();
        await page.locator("[data-local-generate]").click();
        report.uiOneLinerPrivacyDecisions = await reviewSyntheticPrivacy();
        await page.locator("[data-local-apply]:enabled").waitFor({ timeout: 240000 });
        await page.getByRole("textbox", { name: "Proposed note text", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${directory}/draft-${modelKey}-one-liner.png` });
        report.uiOneLiner = await page.getByRole("textbox", { name: "Proposed note text", exact: true }).inputValue();
        if (!/G6P2032/.test(report.uiOneLiner) || !/LEEP/.test(report.uiOneLiner) || !/syphilis/i.test(report.uiOneLiner) || /\[ID\]|<think>|Ask:/.test(report.uiOneLiner)) throw new Error("The real de-identified one-liner missed its baseline/history check.");
        await page.locator("[data-local-apply]").click();
        report.uiOneLinerApplied = await page.evaluate(() => globalThis.__noteUiApplied);
      }
      report.externalWrites = externalWrites;
      if (externalWrites.length) throw new Error("An unexpected external write occurred during local evaluation.");
    }
  }
} catch (error) { report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { report.finishedAt = new Date().toISOString(); await save(); await browser.close(); await server.close(); }
