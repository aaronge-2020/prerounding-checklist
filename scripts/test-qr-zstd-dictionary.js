import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".bin", "application/octet-stream"]
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeLocalBundle(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function encodeLocalBundle(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(root, `.${relative}`);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function assertFixedZstdDictionaryCodec(audit, label) {
  const candidates = Array.isArray(audit.qrCodecCandidates) ? audit.qrCodecCandidates : [];
  assert(audit.qrCodec === "Z" && audit.qrCodecFormat === "zstd-dict", `${label} should use the fixed local zstd dictionary codec: ${JSON.stringify(audit)}`);
  assert(candidates.length === 1, `${label} should not run a runtime codec tournament: ${JSON.stringify(candidates)}`);
  assert(candidates[0]?.format === "zstd-dict" && /^[a-f0-9]{16}$/.test(candidates[0]?.dictionaryHash || ""), `${label} should record the dictionary hash: ${JSON.stringify(candidates)}`);
  const valid = candidates.filter((candidate) => candidate.supported && candidate.roundTrip && candidate.tokenLength > 0);
  assert(valid.length === 1, `${label} should have one round-tripped zstd-dict codec: ${JSON.stringify(candidates)}`);
  const chosen = valid.find((candidate) => candidate.chosen);
  assert(chosen && audit.qrTokenLength === chosen.tokenLength, `${label} telemetry should match the fixed zstd-dict token: ${JSON.stringify({ chosen, candidates, audit })}`);
}

async function qrAudit(page, selector) {
  return page.evaluate((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    return {
      qrLink: panel?.dataset.qrLink || "",
      qrText: panel?.dataset.qrText || "",
      qrScanTexts: JSON.parse(panel?.dataset.qrScanTexts || "[]"),
      qrToken: panel?.dataset.qrToken || "",
      qrModules: Number(panel?.dataset.qrModules || 0),
      qrMaxModules: Number(panel?.dataset.qrMaxModules || 0),
      qrChunks: Number(panel?.dataset.qrChunks || 0),
      qrJsonLength: Number(panel?.dataset.qrJsonLength || 0),
      qrTokenLength: Number(panel?.dataset.qrTokenLength || 0),
      qrCodec: panel?.dataset.qrCodec || "",
      qrCodecFormat: panel?.dataset.qrCodecFormat || "",
      qrRawCborBytes: Number(panel?.dataset.qrRawCborBytes || 0),
      qrCompressedBytes: Number(panel?.dataset.qrCompressedBytes || 0),
      qrCodecCandidates: JSON.parse(panel?.dataset.qrCodecCandidates || "[]")
    };
  }, selector);
}

async function answerVisibleChecklistRows(page) {
  await page.evaluate(() => {
    for (const row of document.querySelectorAll(".checklist-row")) {
      const chip = row.querySelector(".answer-chip");
      if (chip) {
        chip.click();
        continue;
      }
      const endorsement = row.querySelector(".endorsement-button");
      if (endorsement) {
        endorsement.click();
        continue;
      }
      const select = row.querySelector("select.answer-select");
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });
}

async function main() {
  const { server, baseUrl } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await desktopContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    const desktop = await desktopContext.newPage();
    await desktop.goto(`${baseUrl}/index.html?qrZstdDictionary=${Date.now()}`);
    await desktop.waitForFunction(() => document.body.dataset.view === "vaultAccess");
    await desktop.click("#demoCaseButton");
    await desktop.waitForFunction(() => document.body.dataset.view === "workspace");
    await desktop.click("#workspaceBuildChecklistButton");
    await desktop.waitForFunction(() => /items built|checklist ready|Answer bedside checklist/i.test(document.querySelector("#workspaceChecklistStatus")?.textContent || document.body.innerText || ""));
    await desktop.click("#workspaceChecklistPhoneButton");
    await desktop.waitForFunction(() => document.querySelector("#phonePayload")?.value.length > 100);
    await desktop.waitForSelector("#phoneQrCode svg", { timeout: 45000 });

    const workupAudit = await qrAudit(desktop, "#phoneQrPanel");
    assert(/^W2Z:[0-9A-Z$*\-./:]+$/.test(workupAudit.qrToken), `workup QR should use the fixed zstd-dictionary raw token: ${JSON.stringify(workupAudit)}`);
    assert(workupAudit.qrText === workupAudit.qrToken, `workup QR should render the raw token, not the URL: ${JSON.stringify(workupAudit)}`);
    assert(workupAudit.qrScanTexts.length === workupAudit.qrChunks && workupAudit.qrChunks >= 1 && workupAudit.qrChunks <= 3, `workup QR should expose one to three scan frames: ${JSON.stringify(workupAudit)}`);
    assert(workupAudit.qrChunks === 1 && workupAudit.qrMaxModules <= 155, `demo workup QR should stay one frame when possible: ${JSON.stringify(workupAudit)}`);
    assert(workupAudit.qrRawCborBytes > 0 && workupAudit.qrCompressedBytes > 0 && workupAudit.qrCodec, `workup QR should expose size telemetry: ${JSON.stringify(workupAudit)}`);
    assertFixedZstdDictionaryCodec(workupAudit, "workup QR");

    const desktopBundle = decodeLocalBundle(await desktop.inputValue("#phonePayload"));
    const manifestItemCount = desktopBundle.manifest.sections.reduce((sum, section) => sum + section.items.length, 0);
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await phoneContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    const phone = await phoneContext.newPage();
    await phone.goto(workupAudit.qrLink);
    await phone.waitForSelector("#bedsideView:not([hidden])", { timeout: 45000 });
    await phone.waitForFunction((expected) => document.querySelectorAll(".checklist-row").length === expected, manifestItemCount);
    const phoneLoadAudit = await phone.evaluate(() => ({
      view: document.body.dataset.view,
      rowCount: document.querySelectorAll(".checklist-row").length,
      hash: location.hash,
      storageKeys: Object.keys(localStorage)
    }));
    assert(phoneLoadAudit.view === "bedside" && phoneLoadAudit.rowCount === manifestItemCount, `phone should load the exact synced workup manifest: ${JSON.stringify(phoneLoadAudit)}`);
    assert(phoneLoadAudit.hash === "" && phoneLoadAudit.storageKeys.length === 0, `phone QR import should clear the fragment and avoid localStorage writes: ${JSON.stringify(phoneLoadAudit)}`);

    await answerVisibleChecklistRows(phone);
    await phone.waitForFunction(() => document.body.dataset.bedsideComplete === "true");
    await phone.waitForSelector("#bedsideCompletionQrCode svg", { timeout: 45000 });
    const returnAudit = await qrAudit(phone, "#bedsideCompletionPanel");
    assert(/^A2Z:[0-9A-Z$*\-./:]+$/.test(returnAudit.qrToken), `return QR should use the fixed zstd-dictionary answer token: ${JSON.stringify(returnAudit)}`);
    assert(returnAudit.qrText === returnAudit.qrToken, `return QR should render the raw token when it fits one frame: ${JSON.stringify(returnAudit)}`);
    assert(returnAudit.qrScanTexts.length === returnAudit.qrChunks && returnAudit.qrChunks >= 1 && returnAudit.qrChunks <= 3, `return QR should expose one to three scan frames: ${JSON.stringify(returnAudit)}`);
    assert(returnAudit.qrChunks === 1 && returnAudit.qrMaxModules <= 155, `demo return QR should stay one frame when possible: ${JSON.stringify(returnAudit)}`);
    assert(returnAudit.qrRawCborBytes > 0 && returnAudit.qrCompressedBytes > 0 && returnAudit.qrCodec, `return QR should expose size telemetry: ${JSON.stringify(returnAudit)}`);
    assertFixedZstdDictionaryCodec(returnAudit, "return QR");

    await phone.click("#completionCopyPhoneReturnPayloadButton");
    await phone.waitForSelector("#phiOverlay:not([hidden])");
    await phone.click("#confirmPhiActionButton");
    await phone.waitForFunction(() => document.querySelector("#phiOverlay")?.hidden === true);
    const copiedReturnPayload = await phone.evaluate(async () => navigator.clipboard.readText());
    const staleReturn = decodeLocalBundle(copiedReturnPayload);
    staleReturn.manifestHash = "0000000000000000";
    staleReturn.checklistManifestHash = "0000000000000000";
    staleReturn.checklistFingerprint = "0000000000000000";
    await desktop.fill("#phoneImportInput", encodeLocalBundle(staleReturn));
    await desktop.click("#importPhoneFindingsButton");
    await desktop.waitForFunction(() => /different checklist|fresh phone bundle|checklist fingerprint/i.test(document.querySelector("#handoffStatus")?.textContent || ""));

    await desktop.fill("#phoneImportInput", returnAudit.qrToken);
    await desktop.click("#importPhoneFindingsButton");
    await desktop.waitForFunction(() => /Phone checklist answers imported/i.test(document.querySelector("#handoffStatus")?.textContent || ""), null, { timeout: 45000 });
    const importAudit = await desktop.evaluate(() => ({
      status: document.querySelector("#handoffStatus")?.textContent || "",
      answeredRows: document.querySelectorAll(".checklist-row.is-answered").length,
      summaryRows: document.querySelectorAll("#phoneImportSummaryList .phone-import-summary-row").length,
      selectedPrompt: document.querySelector("#patientSelectedTaskTitle")?.textContent || ""
    }));
    assert(importAudit.answeredRows > 0 && importAudit.summaryRows > 0, `desktop should import optimized return answers and show a confirmation summary: ${JSON.stringify(importAudit)}`);
    assert(/Final rounds update/i.test(importAudit.selectedPrompt), `desktop should navigate to the prompt screen after import: ${JSON.stringify(importAudit)}`);

    await phoneContext.close();
    await desktopContext.close();
    console.log("QR zstd dictionary checks passed.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

await main();
