// Browser eval: runs the local-LLM section splitter over the eval fixtures
// inside real Chromium (WebGPU via SwiftShader when no physical GPU exists)
// and scores it with the shared scorer.
//
// Usage:
//   node --import ./tests/helpers/playwright-system-chromium.js \
//     tests/test-local-llm-eval-browser.js [qwen3-1.7b|qwen3-4b]
//
// The model weights (~1.1GB for 1.7B, ~2.5GB for 4B) download from Hugging
// Face on first run and are cached by the browser profile. On software
// WebGPU this takes a long time; the script allows up to 90 minutes per
// model. Results go to /tmp/local-llm-eval-<modelKey>.json.

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createAppServer } from "./browser/app-harness.js";

const modelKey = process.argv[2] || "qwen3-1.7b";
const EVAL_TIMEOUT_MS = 90 * 60 * 1000;

const server = await createAppServer();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: [
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--disable-features=LocalNetworkAccessChecks",
    "--no-proxy-server"
  ]
});

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  const url = `${server.baseUrl}tests/browser/local-llm-eval.html`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__localLlmEval && window.__localLlmEval.fixtures, null, { timeout: 60000 });
  console.log("fixtures:", await page.evaluate(() => window.__localLlmEval.fixtures.join(", ")));

  const webgpu = await page.evaluate(() => window.__localLlmEval.webgpu());
  console.log("webgpu available in test browser:", webgpu);
  if (!webgpu) {
    throw new Error("WebGPU is not available in the test browser; cannot run the model eval.");
  }

  console.log(`running eval for ${modelKey} (this downloads the model on first run) ...`);
  const started = Date.now();
  const result = await page.evaluate(
    (key) => window.__localLlmEval.run(key),
    modelKey,
    { timeout: EVAL_TIMEOUT_MS }
  );
  console.log(`eval finished in ${Math.round((Date.now() - started) / 1000)}s`);

  const outPath = `/tmp/local-llm-eval-${modelKey}.json`;
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`wrote ${outPath}`);

  console.log("fixture            accuracy  dropped  verbatim  ms");
  for (const r of result.results) {
    if (r.error) {
      console.log(`${r.fixtureId.padEnd(18)} ERROR ${r.error.slice(0, 60)}`);
    } else {
      console.log(
        `${r.fixtureId.padEnd(18)} ${(r.accuracy * 100).toFixed(1).padStart(7)}% ` +
        `${String(r.dropped).padStart(7)} ${(r.verbatimRate * 100).toFixed(1).padStart(7)}% ` +
        `${String(Math.round(r.latencyMs)).padStart(6)}`
      );
    }
  }
  const s = result.summary;
  console.log(
    `TOTAL ${s.fixtures} fixtures, ${s.sentences} sentences: ` +
    `accuracy ${(s.accuracy * 100).toFixed(1)}%, drop rate ${(s.dropRate * 100).toFixed(1)}%, ` +
    `verbatim ${(s.verbatimRate * 100).toFixed(1)}%`
  );
  if (result.errors.length) console.log("ERRORS:", JSON.stringify(result.errors, null, 2));
  if (pageErrors.length) console.log("PAGE ERRORS:", pageErrors.slice(0, 10));
} finally {
  await browser.close();
  await server.close();
}
