// Browser compatibility test: live transformers.js embedding runs for both
// candidate RAG models in real Chromium.
//
// Runs: chart text -> chunking -> on-device embeddings -> top-k retrieval ->
// grounded prompt assembly, plus the full rag-service path (worker +
// IndexedDB vector cache).
//
// Usage:
//   PLAYWRIGHT_SYSTEM_CHROMIUM=/path/to/chrome node tests/test-rag-embedding-browser.js
//
// The embedding models (~90MB MiniLM, ~130MB bge-small) download from
// Hugging Face on first run and are cached by the browser profile. Allow
// several minutes on first run. Results go to
// /tmp/rag-embedding-compat.json.
//
// The browser honors the HTTPS_PROXY/https_proxy environment for model
// downloads (bypassing the proxy for the local test server), so this also
// runs inside sandboxes with a mandatory egress proxy.

import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEFAULT_RAG_MODEL_KEY } from "../src/rag/rag-models.js";

const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Offline compat: RAG_LOCAL_MODEL_DIR points at a directory laid out like
// <dir>/Xenova/<model>/<files> (config.json, tokenizer.json,
// onnx/model.onnx). The files are served from the SAME origin as the app
// (under /__rag_models/) so the harness CSP stays intact; the harness then
// loads the pinned models locally instead of from Hugging Face. Omit the
// env var on machines with direct internet access.
const MODEL_MOUNT = "/__rag_models/";

function createTestServer(modelDir) {
  const mime = new Map([
    [".html", "text/html"],
    [".js", "text/javascript"],
    [".mjs", "text/javascript"],
    [".css", "text/css"],
    [".json", "application/json"],
    [".wasm", "application/wasm"],
    [".onnx", "application/octet-stream"]
  ]);
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let root = repoRoot;
    let relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (modelDir && url.pathname.startsWith(MODEL_MOUNT)) {
      root = modelDir;
      relative = url.pathname.slice(MODEL_MOUNT.length);
    }
    const file = normalize(join(root, relative));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    const size = statSync(file).size;
    const contentType = mime.get(extname(file)) || "application/octet-stream";
    // transformers.js probes file existence with `Range: bytes=0-0`.
    const range = request.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] === "" ? Math.min(start, size - 1) : Math.min(Number(match[2]), size - 1);
        response.writeHead(206, {
          "content-type": contentType,
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(end - start + 1),
          "accept-ranges": "bytes"
        });
        createReadStream(file, { start, end }).pipe(response);
        return;
      }
    }
    response.writeHead(200, { "content-type": contentType, "content-length": String(size) });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const baseUrl = `http://127.0.0.1:${server.address().port}/`;
      resolve({
        baseUrl,
        modelBaseUrl: modelDir ? `${baseUrl}__rag_models/` : null,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

const localModelDir = process.env.RAG_LOCAL_MODEL_DIR || null;
if (localModelDir) {
  assert.ok(existsSync(localModelDir), `RAG_LOCAL_MODEL_DIR does not exist: ${localModelDir}`);
}
const server = await createTestServer(localModelDir);
const modelBaseParam = server.modelBaseUrl ? `?modelBase=${encodeURIComponent(server.modelBaseUrl)}` : "";
if (server.modelBaseUrl) console.log("serving local embedding models from", server.modelBaseUrl);
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
function proxyLaunchOption() {
  if (!proxyServer) return {};
  const url = new URL(proxyServer);
  const proxy = { server: `${url.protocol}//${url.host}`, bypass: "127.0.0.1,localhost" };
  if (url.username) {
    proxy.username = decodeURIComponent(url.username);
    proxy.password = decodeURIComponent(url.password);
  }
  return { proxy };
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_SYSTEM_CHROMIUM || "/opt/meta-chromium/chrome",
  ...proxyLaunchOption(),
  args: ["--disable-features=LocalNetworkAccessChecks"]
});

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  const url = `${server.baseUrl}tests/browser/rag-harness.html${modelBaseParam}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ragHarness && window.__ragHarness.modelKeys, null, { timeout: 60000 });
  console.log("candidate models:", (await page.evaluate(() => window.__ragHarness.modelKeys)).join(", "));

  console.log("running live embedding compat (downloads models on first run) ...");
  const started = Date.now();
  page.setDefaultTimeout(RUN_TIMEOUT_MS);
  const result = await page.evaluate(() => window.__ragHarness.run());
  console.log(`finished in ${Math.round((Date.now() - started) / 1000)}s`);

  const outPath = "/tmp/rag-embedding-compat.json";
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`wrote ${outPath}`);

  for (const [key, model] of Object.entries(result.models)) {
    if (model.error) {
      console.log(`[${key}] LOAD/INDEX FAILED: ${model.error}`);
      continue;
    }
    console.log(
      `[${key}] ${model.modelId}: load ${model.loadMs}ms, index ${model.indexMs}ms, ` +
      `dims ${model.loadedDims}, recall@1 ${(model.recallAt1 * 100).toFixed(0)}%`
    );
    for (const c of model.cases) {
      console.log(`    rank ${c.rank}  top=${c.topId}  score=${c.topScore}  "${c.query}"`);
    }
  }
  console.log("[service]", JSON.stringify(result.servicePath));

  // --- assertions ---
  const loaded = Object.entries(result.models).filter(([, m]) => !m.error);
  assert.ok(loaded.length > 0, "at least one embedding model must load in real Chromium");
  for (const [key, model] of loaded) {
    assert.equal(model.loadedDims, 384, `${key}: embedding dims must be 384`);
    assert.equal(model.indexedCount, result.chunkCount, `${key}: all chunks indexed`);
  }
  const defaultModel = result.models[DEFAULT_RAG_MODEL_KEY];
  assert.ok(defaultModel && !defaultModel.error, `default model ${DEFAULT_RAG_MODEL_KEY} must load`);
  assert.equal(defaultModel.recallAt1, 1, `default model must rank the expected chunk first for every query`);

  const service = result.servicePath;
  assert.ok(service && !service.error, "rag-service retrieveChartChunks must work in the browser");
  assert.equal(service.firstTopId, "admission:hpi#0", "service retrieval ranks the expected chunk first");
  assert.ok(service.cacheReused, "second retrieval reuses the IndexedDB vector cache");
  assert.ok(service.promptHasC1, "grounded prompt block numbers excerpts [C1]");
  assert.ok(service.promptHasInstructions, "grounded prompt block carries the citation instructions");

  const fatalErrors = pageErrors.filter((text) => !/favicon/i.test(text));
  assert.deepEqual(fatalErrors, [], `no page errors during the run: ${fatalErrors.join(" | ")}`);

  console.log(`\nCOMPAT PASS: default model ${DEFAULT_RAG_MODEL_KEY} loads, retrieves at recall@1=100%, service path verified.`);
} finally {
  await browser.close();
  await server.close();
}
