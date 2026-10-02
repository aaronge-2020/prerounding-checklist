// ws2 send-path capture: 1 note via API, then real buildTransmitPayload +
// real requestOpenAiChat with parent-authorized dummy key (expect 401).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const WS2 = "/home/hatch/workspace/deid-validation/ws2-zero-egress";
const NOTES = JSON.parse(fs.readFileSync(path.join(WS2, "notes.synthetic.json"), "utf8"));
const PHI = NOTES.phi_strings;

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => a.startsWith("--") ? [[a.slice(2), arr[i+1]]] : [])
);
const PROFILE = args.profile;
const OUT = args.out;
const BASE = `http://127.0.0.1:${args.port || "8904"}/`;
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome";

const requests = [];
const responses = [];

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME, headless: true, args: ["--no-sandbox", "--headless=new"]
  });
  await browser.addInitScript(() => {
    const origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input.url || input.toString());
      const r = await origFetch(input, init);
      if (url.includes(".chunks/") && r.ok) {
        const blob = await r.blob();
        return new Response(blob, { status: r.status, statusText: r.statusText, headers: r.headers });
      }
      return r;
    };
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(300000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (e) => {
    try {
      const u = new URL(e.request.url);
      // Sanitize Authorization header before storing
      const headers = { ...e.request.headers };
      if (headers.Authorization) headers.Authorization = "[REDACTED]";
      if (headers.authorization) headers.authorization = "[REDACTED]";
      requests.push({ id: e.requestId, ts: Date.now(), method: e.request.method,
        url: e.request.url, host: u.host, headers,
        postData: e.request.postData || null });
    } catch {}
  });
  cdp.on("Network.responseReceived", (e) => {
    responses.push({ id: e.requestId, ts: Date.now(), url: e.response.url, status: e.response.status });
  });

  console.log(`session=send base=${BASE}`);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""),
    null, { timeout: 120000 });
  console.log("vault unlocked");

  // De-identify one note via API, then use the REAL transmit builder + client.
  const sendResult = await page.evaluate(async ({ noteText, phiStrings }) => {
    const out = {};
    const svc = await import("/src/patient-context/deid-service.js");
    await svc.preloadAdvancedDeidModel({ modelKey: "stanford-clinical" });
    const r = await svc.deidentifyText(noteText, { mode: "stanford-clinical" });
    out.redactedChars = r.text.length;
    out.redactedPreview = r.text.slice(0, 120);
    const delta = await import("/src/ui/ai-chat/delta-review.js?v=20260929-ai-chat-v5");
    const client = await import("/src/ui/openai-client.js?v=20260929-ai-chat-v2");
    out.hasBuilder = typeof delta.buildTransmitPayload === "function";
    out.hasClient = typeof client.requestOpenAiChat === "function";
    const transmit = delta.buildTransmitPayload({
      approvedById: { "note-1": r.text },
      pieceOrder: ["note-1"],
      transformedMessage: r.text,
      systemPrompt: "You are a clinical documentation assistant. (ws2 validation probe)",
      history: []
    });
    const wire = JSON.stringify(transmit.input);
    out.phiInWireInput = phiStrings.filter((s) => wire.includes(s));
    out.redactedInWire = wire.includes(r.text.slice(0, 50));
    try {
      await client.requestOpenAiChat({ apiKey: "sk-test-dummy", model: "gpt-6-luna", input: transmit.input });
      out.status = "unexpected-success";
    } catch (e) {
      out.status = "threw";
      out.error = String((e && e.message) || e).slice(0, 200);
    }
    return out;
  }, { noteText: NOTES.notes[0].text, phiStrings: PHI });

  console.log("send result:", JSON.stringify(sendResult, null, 2));

  // Assert: exactly one api.openai.com request, no PHI in body, redacted text present.
  const openaiReqs = requests.filter((r) => r.host === "api.openai.com");
  console.log(`openai requests: ${openaiReqs.length}`);
  let assertion = "FAIL";
  if (openaiReqs.length === 1) {
    const body = openaiReqs[0].postData || "";
    const phiHits = PHI.filter((s) => body.includes(s));
    const hasRedacted = body.includes("[PATIENT NAME]") || body.includes("[DOB]");
    console.log(`phi hits in OpenAI body: ${JSON.stringify(phiHits)}`);
    console.log(`redacted markers present: ${hasRedacted}`);
    if (phiHits.length === 0 && hasRedacted) assertion = "PASS";
  }
  console.log(`ASSERTION: ${assertion}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ session: "send", base: BASE,
    capturedAt: new Date().toISOString(), requestCount: requests.length,
    requests, responses, sendResult, assertion }, null, 1));
  console.log(`wrote ${OUT}`);
  await browser.close();
  if (assertion !== "PASS") process.exit(2);
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
