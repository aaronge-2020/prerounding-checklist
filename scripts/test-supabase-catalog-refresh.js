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

function rowsForVersion(version) {
  const current = version === 2;
  const sourceId = current ? "PUBLIC_SOURCE_V2" : "PUBLIC_SOURCE_V1";
  return {
    workups: [{
      id: "hyperglycemia_possible_dka_v1",
      title: current ? "Public refreshed Hyperglycemia Workup" : "Public initial Hyperglycemia Workup",
      version: current ? "public-v2" : "public-v1",
      status: "mvp",
      complaint_group: "endocrine",
      population: { age_group: "adult" },
      module_path: "medical-knowledge/complaint-modules/hyperglycemia_possible_dka_v1.json",
      source_ids: [sourceId],
      payload: {
        triggers: ["server dka"],
        applicability: { age_group: "adult" }
      },
      updated_at: current ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }],
    sections: [{
      workup_id: "hyperglycemia_possible_dka_v1",
      section_key: "history_questions",
      sort_order: 1,
      payload: {
        requiredQuestions: [{
          id: current ? "public_refreshed_question" : "public_initial_question",
          item_type: "history_question",
          label: current ? "Public refreshed missed insulin question?" : "Public initial missed insulin question?",
          text: current ? "Public refreshed missed insulin question?" : "Public initial missed insulin question?",
          answerMode: "single",
          options: ["No missed doses", "Missed dose", "Unsure"],
          normalAnswers: ["No missed doses"],
          source: { source_id: sourceId }
        }],
        conditionalQuestions: []
      },
      updated_at: current ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }],
    sources: [{
      id: sourceId,
      source_id: sourceId,
      title: current ? "Public refreshed source" : "Public initial source",
      source_type: "guideline",
      citation: current ? "Public refreshed source" : "Public initial source",
      payload: { id: sourceId, title: current ? "Public refreshed source" : "Public initial source" },
      updated_at: current ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }]
  };
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  let catalogVersion = 1;
  const requests = {
    workups: 0,
    sections: 0,
    sources: 0,
    headers: []
  };

  await page.route("https://hajjuzpnlvpetsleuxwb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rows = rowsForVersion(catalogVersion);
    if (url.pathname === "/rest/v1/workups" && request.method() === "GET") {
      requests.workups += 1;
      requests.headers.push(request.headers().authorization || "");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.workups) });
      return;
    }
    if (url.pathname === "/rest/v1/workup_sections" && request.method() === "GET") {
      requests.sections += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.sections) });
      return;
    }
    if (url.pathname === "/rest/v1/sources" && request.method() === "GET") {
      requests.sources += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.sources) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: `Unexpected request: ${request.method()} ${url.pathname}` });
  });

  await page.goto(`${baseUrl}/index.html?supabaseCatalogRefresh=${Date.now()}`);
  await waitForCondition(() => requests.workups >= 1 && requests.sections >= 1 && requests.sources >= 1, "initial public catalog");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await page.waitForFunction(() => /Public initial Hyperglycemia Workup/.test(document.querySelector("#workupStudioList")?.textContent || ""));

  catalogVersion = 2;
  const requestsBeforeOnline = requests.workups;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitForCondition(() => requests.workups >= requestsBeforeOnline + 1, "online public catalog refresh");
  await page.waitForFunction(() => /Public refreshed Hyperglycemia Workup/.test(document.querySelector("#workupStudioList")?.textContent || ""));

  await page.click("#sidebarPatientRosterButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace");
  await page.locator('button[data-patient-tab="workup"]').evaluate((button) => button.click());
  await page.fill("#patientWorkupConcernInput", "server dka");
  await page.waitForFunction(() => /Public refreshed Hyperglycemia Workup/.test(document.querySelector("#patientWorkupResults")?.textContent || ""));
  await page.locator("#patientWorkupResults .workup-result-row", { hasText: "Public refreshed Hyperglycemia Workup" }).first().click();
  await page.locator('button[data-patient-tab="checklist"]').evaluate((button) => button.click());
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  const audit = await page.evaluate(() => ({
    selectedWorkup: document.querySelector("#patientValidatedIntentLabel")?.textContent || "",
    checklist: document.querySelector("#workspaceChecklistDirectory")?.textContent || "",
    overflow: (document.scrollingElement || document.documentElement).scrollWidth - document.documentElement.clientWidth
  }));

  assert(requests.headers.every((header) => /sb_publishable_/i.test(header)), `Public refresh should use publishable-key reads only: ${JSON.stringify(requests.headers)}`);
  assert.match(audit.selectedWorkup, /Public refreshed Hyperglycemia Workup/, `Patient workspace should use refreshed server catalog: ${JSON.stringify(audit)}`);
  assert.match(audit.checklist, /Public refreshed missed insulin question/i, `Built checklist should use refreshed server sections: ${JSON.stringify(audit)}`);
  assert.ok(audit.overflow <= 2, `Workspace should not overflow after online refresh: ${JSON.stringify(audit)}`);

  console.log("Supabase catalog refresh checks passed.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
