import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"]
]);

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

async function waitForCondition(callback, label, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  const requests = {
    workups: 0,
    sections: 0,
    sources: 0,
    headers: []
  };

  await page.route("https://hajjuzpnlvpetsleuxwb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/rest/v1/workups" && request.method() === "GET") {
      requests.workups += 1;
      requests.headers.push(request.headers().authorization || "");
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname === "/rest/v1/workup_sections" && request.method() === "GET") {
      requests.sections += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname === "/rest/v1/sources" && request.method() === "GET") {
      requests.sources += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: `Unexpected request: ${request.method()} ${url.pathname}` });
  });

  await page.goto(`${baseUrl}/index.html?emptyPublicCatalog=${Date.now()}`);
  await waitForCondition(() => requests.workups >= 1, "empty public catalog request");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace");
  await page.locator('button[data-patient-tab="checklist"]').evaluate((button) => button.click());
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));

  let audit = await page.evaluate(() => ({
    selectedWorkup: document.querySelector("#patientValidatedIntentLabel")?.textContent || "",
    status: document.querySelector("#workspaceChecklistStatus")?.textContent || "",
    checklist: document.querySelector("#workspaceChecklistDirectory")?.textContent || "",
    phoneHidden: Boolean(document.querySelector("#workspaceChecklistPhoneButton")?.hidden),
    phoneDisabled: Boolean(document.querySelector("#workspaceChecklistPhoneButton")?.disabled),
    overflow: (document.scrollingElement || document.documentElement).scrollWidth - document.documentElement.clientWidth
  }));
  assert.match(audit.selectedWorkup, /Hyperglycemia \/ possible DKA or HHS/i, `Empty server catalog should preserve bundled selected workup: ${JSON.stringify(audit)}`);
  assert.match(audit.status, /items built/i, `Bundled checklist should still build when public server catalog is empty: ${JSON.stringify(audit)}`);
  assert.doesNotMatch(audit.status, /server update available/i, `Empty server catalog should not mark the local checklist as a newer server update: ${JSON.stringify(audit)}`);
  assert.equal(audit.phoneHidden, false, `Phone handoff should remain available after building the bundled fallback checklist: ${JSON.stringify(audit)}`);
  assert.equal(audit.phoneDisabled, false, `Empty server catalog should not disable a fresh bundled checklist phone handoff: ${JSON.stringify(audit)}`);
  assert.ok(audit.overflow <= 2, `Workspace should not overflow while using bundled fallback workups: ${JSON.stringify(audit)}`);

  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  audit = await page.evaluate(() => ({
    backendStatus: document.querySelector("#workupStudioBackendStatus")?.textContent || "",
    listText: document.querySelector("#workupStudioList")?.textContent || "",
    topBackendStatus: document.querySelector("#workupStudioTopBackendStatus")?.textContent || "",
    overflow: (document.scrollingElement || document.documentElement).scrollWidth - document.documentElement.clientWidth
  }));
  assert(requests.headers.every((header) => /sb_publishable_/i.test(header)), `Empty public catalog probe should use publishable-key auth only: ${JSON.stringify(requests.headers)}`);
  assert.equal(requests.sections, 0, `Empty public catalog should not request sections without reviewed workups: ${JSON.stringify(requests)}`);
  assert.equal(requests.sources, 0, `Empty public catalog should not request sources without reviewed workups: ${JSON.stringify(requests)}`);
  assert.match(audit.backendStatus, /Public Supabase workup refresh failed/i, `Studio should surface empty public catalog failure: ${JSON.stringify(audit)}`);
  assert.match(audit.backendStatus, /no reviewed workups/i, `Studio status should name missing reviewed workups: ${JSON.stringify(audit)}`);
  assert.match(audit.listText, /Hyperglycemia \/ possible DKA or HHS/i, `Studio should keep bundled workups usable after empty public catalog: ${JSON.stringify(audit)}`);
  assert.ok(audit.overflow <= 2, `Studio should not overflow while showing empty catalog diagnostic: ${JSON.stringify(audit)}`);

  console.log("Empty public Supabase catalog fallback checks passed.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
