// ws2 zero-egress capture driver.
// Usage:
//   node capture.mjs --session cold|warm|send --port 8903 --profile /tmp/ws2prof-cold --out captures/cold.cdp.json
//
// Drives the DEPLOYED app (overlay of remote main) in headless Chromium with
// full CDP network capture:
//   cold: fresh profile -> unlock vault -> Quick De-ID -> select Stanford model ->
//         run 5 synthetic notes through de-id + Confirm-all review ->
//         briefly start the OpenMed Small pack download (records HF CDN hosts), cancel it
//   warm: same profile -> reload -> run 1 note again (model cached) -> confirm no re-download
//   send: in-page, build the REAL transmit payload from reviewed redacted text via
//         delta-review.js buildTransmitPayload, then call the REAL requestOpenAiChat
//         with the parent-authorized dummy key "sk-test-dummy" (expect HTTP 401).
//         CDP captures the exact request; the driver asserts synthetic PHI absence.
//
// All note text is synthetic (notes.synthetic.json).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const WS2 = "/home/hatch/workspace/deid-validation/ws2-zero-egress";
const NOTES = JSON.parse(fs.readFileSync(path.join(WS2, "notes.synthetic.json"), "utf8"));

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith("--") ? [[a.slice(2), arr[i + 1]]] : []
  )
);
const SESSION = args.session || "cold";
const PORT = args.port || "8904";
const PROFILE = args.profile || `/tmp/ws2prof-${SESSION}`;
const OUT = args.out || path.join(WS2, "captures", `${SESSION}.cdp.json`);
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome";
const DUMMY_KEY = "sk-test-dummy"; // parent-authorized dummy credential for the send-path test

const requests = [];   // {id, ts, method, url, host, headers, postDataLen, postData}
const responses = [];  // {id, ts, url, status}
const failures = [];

function summarizePostData(pd) {
  if (pd == null) return null;
  const s = String(pd);
  return {
    bytes: s.length,
    sha256: null, // filled later in analysis if needed
    // store full text for the authorized send-path assertion; synthetic only
    text: SESSION === "send" ? s : s.slice(0, 4000)
  };
}

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--headless=new"]
  });
  // Test-environment workaround (not an app change): buffer model-chunk response
  // bodies in JS memory instead of leaving them unread in the browser's network
  // buffers. Headless Chromium deadlocks when 4+ concurrent 8MB chunk bodies go
  // unread (6-connection limit); the deployed app's chunk URLs, request count,
  // and bytes on the wire are identical. Installed before page load so the app's
  // fetch wrappers chain through it.
  await browser.addInitScript(() => {
    const origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input.url || input.toString());
      const r = await origFetch(input, init);
      if (url.includes(".chunks/") && r.ok) {
        // Buffer in a Blob (single copy); the app's arrayBuffer() will slice from it.
        const blob = await r.blob();
        return new Response(blob, { status: r.status, statusText: r.statusText, headers: r.headers });
      }
      return r;
    };
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(120000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (e) => {
    try {
      const u = new URL(e.request.url);
      requests.push({
        id: e.requestId, ts: Date.now(), method: e.request.method,
        url: e.request.url, host: u.host,
        headers: e.request.headers,
        postData: summarizePostData(e.request.postData)
      });
    } catch { /* ignore malformed */ }
  });
  cdp.on("Network.responseReceived", (e) => {
    responses.push({ id: e.requestId, ts: Date.now(), url: e.response.url, status: e.response.status });
  });
  cdp.on("Network.loadingFailed", (e) => {
    failures.push({ id: e.requestId, ts: Date.now(), error: e.errorText, cancelled: e.canceled });
  });
  page.on("pageerror", (err) => console.error("[pageerror]", String(err).slice(0, 400)));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[console.error]", m.text().slice(0, 300));
  });

  console.log(`session=${SESSION} base=${BASE}`);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  console.log("app booted, title:", await page.title());

  // Unlock a fresh vault (synthetic passphrase).
  await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(
    () => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""),
    null, { timeout: 120000 }
  );
  console.log("vault unlocked");
  if (await page.locator("#newPatientLabel").count()) {
    await page.fill("#newPatientLabel", "Synthetic Room");
    await page.click('[data-action="admit-patient"]');
    await page.waitForSelector("#dailyContent .source-first-stay", { timeout: 60000 }).catch(() => {});
  }

  if (SESSION === "send") {
    await runSendPath(page);
  } else {
    await runQuickDeidSession(page, SESSION);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    session: SESSION, base: BASE, capturedAt: new Date().toISOString(),
    requestCount: requests.length,
    requests, responses, failures
  }, null, 1));
  console.log(`wrote ${OUT} (${requests.length} requests, ${responses.length} responses, ${failures.length} failures)`);
  await browser.close();
}

async function runQuickDeidSession(page, session) {
  await page.click('[data-view-target="quickDeid"]');
  await page.waitForSelector("#quickDeidMode", { timeout: 60000 });
  await page.selectOption("#quickDeidMode", "stanford-clinical");
  console.log("selected stanford-clinical");

  const notes = session === "cold" ? NOTES.notes : [NOTES.notes[0]];
  for (const note of notes) {
    await page.fill("#quickDeidInput", note.text);
    await page.click('[data-action="run-quick-deid"]');
    // Model load (bundled chunks + self-test) happens inside the first run.
    await page.waitForSelector('[data-action="confirm-all-quick-redactions"], .quick-review-complete',
      { timeout: 600000 });
    console.log(`de-id done for ${note.id}`);
    const confirmBtn = page.locator('[data-action="confirm-all-quick-redactions"]');
    if (await confirmBtn.count()) {
      await confirmBtn.first().click();
      console.log(`confirmed all redactions for ${note.id}`);
    }
    // Resolve residual warnings: redact them all (fail-closed posture).
    for (let i = 0; i < 12; i++) {
      const warnBtn = page.locator('[data-action="redact-quick-warning"]');
      if (!(await warnBtn.count())) break;
      await warnBtn.first().click();
    }
    if (session === "cold") {
      await page.click('[data-action="start-new-quick-deid"]');
      await page.waitForSelector("#quickDeidInput");
    }
  }

  if (session === "cold") {
    // Exercise the HF CDN pack-download path briefly to record its hosts, then cancel.
    await page.selectOption("#quickDeidMode", "openmed-superclinical-small");
    await page.waitForTimeout(1500);
    const dlBtn = page.locator('[data-action="download-model-pack"][data-model-key="openmed-superclinical-small"]');
    if (await dlBtn.count()) {
      console.log("starting OpenMed Small pack download to record HF hosts...");
      await dlBtn.first().click();
      // Let the small metadata assets + the start of the weight file flow, then cancel.
      await page.waitForTimeout(45000);
      const cancelBtn = page.locator('[data-action="cancel-model-download"][data-model-key="openmed-superclinical-small"]');
      if (await cancelBtn.count()) {
        await cancelBtn.first().click();
        console.log("cancelled OpenMed Small download");
        await page.waitForTimeout(3000);
      } else {
        console.log("download already finished or no cancel button (see capture)");
      }
    } else {
      console.log("no download button for openmed-superclinical-small (state: see capture)");
    }
  }
  await page.waitForTimeout(2000); // let trailing requests settle
}

async function runSendPath(page) {
  // Reviewed redacted text comes from the REAL Quick De-ID review (Confirm all
  // + redact residual warnings), then the REAL transmit builder
  // (delta-review.js buildTransmitPayload — the exact function the AI chat
  // controller calls) assembles the wire input, and the REAL
  // requestOpenAiChat (openai-client.js) performs the one parent-authorized
  // send with the dummy key "sk-test-dummy". CDP captures the exact request.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click('[data-view-target="quickDeid"]');
  await page.waitForSelector("#quickDeidMode");
  await page.selectOption("#quickDeidMode", "stanford-clinical");
  await page.fill("#quickDeidInput", NOTES.notes[0].text);
  await page.click('[data-action="run-quick-deid"]');
  await page.waitForSelector('[data-action="confirm-all-quick-redactions"], .quick-review-complete', { timeout: 600000 });
  const confirmBtn = page.locator('[data-action="confirm-all-quick-redactions"]');
  if (await confirmBtn.count()) await confirmBtn.first().click();
  for (let i = 0; i < 12; i++) {
    const warnBtn = page.locator('[data-action="redact-quick-warning"]');
    if (!(await warnBtn.count())) break;
    await warnBtn.first().click();
  }
  await page.click('[data-action="copy-quick-deid-output"]');
  const reviewedText = await page.evaluate(() => navigator.clipboard.readText());
  console.log("reviewed text chars:", reviewedText.length);

  const sendResult = await page.evaluate(async ({ reviewedText, phiStrings }) => {
    const out = {};
    try {
      const delta = await import("/src/ui/ai-chat/delta-review.js?v=20260929-ai-chat-v5");
      const client = await import("/src/ui/openai-client.js?v=20260929-ai-chat-v2");
      out.hasBuilder = typeof delta.buildTransmitPayload === "function";
      out.hasClient = typeof client.requestOpenAiChat === "function";
      // Exact transmit assembly the chat controller uses for the reviewed pieces.
      const transmit = delta.buildTransmitPayload({
        approvedById: { "note-1": reviewedText },
        pieceOrder: ["note-1"],
        transformedMessage: reviewedText,
        systemPrompt: "You are a clinical documentation assistant. (ws2 validation probe)",
        history: []
      });
      out.inputChars = JSON.stringify(transmit.input).length;
      out.contextChars = transmit.contextText.length;
      const wire = JSON.stringify(transmit.input);
      out.phiInWireInput = phiStrings.filter((s) => wire.includes(s));
      try {
        // Parent-authorized single send with dummy key; expect HTTP 401.
        await client.requestOpenAiChat({ apiKey: "sk-test-dummy", model: "gpt-6-luna", input: transmit.input });
        out.status = "unexpected-success";
      } catch (e) {
        out.status = "threw";
        out.error = String((e && e.message) || e).slice(0, 300);
      }
    } catch (e) {
      out.status = "import-failed";
      out.error = String((e && e.stack) || e).slice(0, 600);
    }
    return out;
  }, { reviewedText, phiStrings: NOTES.phi_strings });
  console.log("send-path result:", JSON.stringify(sendResult));

  // Programmatic assertion on the captured OpenAI request body.
  const openaiReqs = requests.filter((r) => r.host === "api.openai.com");
  console.log(`captured ${openaiReqs.length} request(s) to api.openai.com`);
  const assertion = { openaiRequestCount: openaiReqs.length, bodiesChecked: 0, phiFound: [], redactedTextPresent: [] };
  for (const r of openaiReqs) {
    const body = r.postData && r.postData.text ? r.postData.text : "";
    if (!body) continue;
    assertion.bodiesChecked++;
    for (const s of NOTES.phi_strings) {
      if (body.includes(s)) assertion.phiFound.push(s);
    }
    assertion.redactedTextPresent.push(body.includes("[PATIENT NAME]") || body.includes("[REDACTED]") || body.includes("Hospital Day"));
  }
  console.log("PHI-absence assertion:", JSON.stringify(assertion));
  fs.writeFileSync(path.join(WS2, "captures", "send-path-assertion.json"), JSON.stringify({
    sendResult, assertion, reviewedTextChars: reviewedText.length,
    reviewedTextExcerpt: reviewedText.slice(0, 600)
  }, null, 1));
  await page.waitForTimeout(2000);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
