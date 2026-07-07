import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const authoringKey = "prerounding-workup-authoring-v1";
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

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForCondition(callback, label, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (callback()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function catalogRows(mode) {
  const authenticated = mode === "authenticated";
  const sourceId = authenticated ? "AUTH_SOURCE" : "PUBLIC_SOURCE";
  return {
    workups: [{
      id: "hyperglycemia_possible_dka_v1",
      title: authenticated ? "Authenticated reviewer workup" : "Public startup workup",
      version: authenticated ? "auth-v3" : "public-v1",
      status: "mvp",
      complaint_group: "endocrine",
      population: { age_group: "adult" },
      module_path: "medical-knowledge/complaint-modules/hyperglycemia_possible_dka_v1.json",
      source_ids: [sourceId],
      payload: {
        triggers: ["server dka"],
        applicability: { age_group: "adult" }
      },
      updated_at: authenticated ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }],
    sections: [{
      workup_id: "hyperglycemia_possible_dka_v1",
      section_key: "history_questions",
      sort_order: 1,
      payload: {
        requiredQuestions: [{
          id: authenticated ? "auth_question" : "public_question",
          item_type: "history_question",
          label: authenticated ? "Authenticated reviewer current question?" : "Public startup question?",
          text: authenticated ? "Authenticated reviewer current question?" : "Public startup question?",
          answerMode: "single",
          options: ["No", "Yes", "Unsure"],
          source: { source_id: sourceId }
        }],
        conditionalQuestions: []
      },
      updated_at: authenticated ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }],
    sources: [{
      id: sourceId,
      source_id: sourceId,
      title: authenticated ? "Authenticated source" : "Public source",
      source_type: "guideline",
      citation: authenticated ? "Authenticated current source" : "Public startup source",
      payload: { id: sourceId, title: authenticated ? "Authenticated source" : "Public source" },
      updated_at: authenticated ? "2026-06-15T00:00:00.000Z" : "2026-06-01T00:00:00.000Z"
    }]
  };
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(({ key, state, sessionKey, session }) => {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }, {
    key: authoringKey,
    state: {
      selectedModuleId: "hyperglycemia_possible_dka_v1",
      sectionKey: "history_questions",
      changeSets: [],
      backend: {
        url: "https://hajjuzpnlvpetsleuxwb.supabase.co",
        anonKey: "sb_publishable_test",
        email: "reviewer@example.test",
        userId: "",
        role: "",
        canReview: false,
        permittedWorkupIds: [],
        permissionChecked: false,
        sessionValidatedAt: ""
      }
    },
    sessionKey: "sb-hajjuzpnlvpetsleuxwb-auth-token",
    session: {
      access_token: "fake-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "fake-refresh-token",
      user: { id: "11111111-1111-4111-8111-111111111111", email: "reviewer@example.test" }
    }
  });
  const page = await context.newPage();
  const requests = {
    publicWorkups: 0,
    authenticatedWorkups: 0,
    publicFulfilled: false,
    authenticatedFulfilled: false,
    workupHeaders: [],
    workupSearches: [],
    sectionSearches: [],
    sourceSearches: []
  };

  await page.route("https://hajjuzpnlvpetsleuxwb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization || "";
    const authenticated = /fake-access-token/.test(authorization);
    const mode = authenticated ? "authenticated" : "public";
    const rows = catalogRows(mode);

    if (url.pathname === "/auth/v1/user" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "reviewer@example.test" })
      });
      return;
    }
    if (url.pathname === "/rest/v1/workup_author_profiles" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ role: "reviewer", display_name: "QA reviewer" }]) });
      return;
    }
    if (url.pathname === "/rest/v1/workup_author_assignments" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname === "/rest/v1/workups" && request.method() === "GET") {
      requests.workupHeaders.push(authorization);
      requests.workupSearches.push({ authenticated, search: url.search });
      if (authenticated) {
        requests.authenticatedWorkups += 1;
      } else {
        requests.publicWorkups += 1;
        await delay(500);
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.workups) });
      if (authenticated) requests.authenticatedFulfilled = true;
      return;
    }
    if (url.pathname === "/rest/v1/workup_sections" && request.method() === "GET") {
      requests.sectionSearches.push({ authenticated, search: decodeURIComponent(url.search) });
      if (!authenticated) await delay(500);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.sections) });
      return;
    }
    if (url.pathname === "/rest/v1/sources" && request.method() === "GET") {
      requests.sourceSearches.push({ authenticated, search: decodeURIComponent(url.search) });
      if (!authenticated) await delay(500);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows.sources) });
      if (!authenticated) requests.publicFulfilled = true;
      return;
    }
    if (url.pathname === "/rest/v1/change_sets" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: `Unexpected request: ${request.method()} ${url.pathname}` });
  });

  await page.goto(`${baseUrl}/index.html?supabaseCatalogRace=${Date.now()}`);
  await waitForCondition(() => requests.publicWorkups >= 1 && requests.authenticatedWorkups >= 1, "parallel public and authenticated catalog requests");
  await waitForCondition(() => requests.publicFulfilled && requests.authenticatedFulfilled, "both catalog requests complete");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await page.waitForFunction(() => /Reviewer signed in as reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  const audit = await page.evaluate(() => ({
    listText: document.querySelector("#workupStudioList")?.textContent || "",
    selectedTitle: document.querySelector("#workupStudioSelectedTitle")?.textContent || "",
    backendStatus: document.querySelector("#workupStudioBackendStatus")?.textContent || "",
    itemList: document.querySelector("#workupStudioItemList")?.textContent || "",
    horizontalOverflow: (document.scrollingElement || document.documentElement).scrollWidth - document.documentElement.clientWidth
  }));
  assert(requests.workupHeaders.some((header) => /sb_publishable_/i.test(header)), `Expected a public startup catalog request: ${JSON.stringify(requests.workupHeaders)}`);
  assert(requests.workupHeaders.some((header) => /fake-access-token/i.test(header)), `Expected an authenticated reviewer catalog request: ${JSON.stringify(requests.workupHeaders)}`);
  assert(requests.workupSearches.some((entry) => !entry.authenticated && /status=in\.\(mvp,active,published,reviewed\)/.test(entry.search)), `Public startup catalog request should filter to active reviewed workups: ${JSON.stringify(requests.workupSearches)}`);
  assert(requests.workupSearches.some((entry) => entry.authenticated && !/status=in\.\(mvp,active,published,reviewed\)/.test(entry.search)), `Authenticated reviewer catalog request should not be limited by the public-only status filter: ${JSON.stringify(requests.workupSearches)}`);
  assert(requests.sectionSearches.some((entry) => !entry.authenticated && /workup_id=in\.\("hyperglycemia_possible_dka_v1"\)/.test(entry.search)), `Public startup catalog request should fetch only active reviewed workup sections: ${JSON.stringify(requests.sectionSearches)}`);
  assert(requests.sectionSearches.some((entry) => entry.authenticated && !/workup_id=in\./.test(entry.search)), `Authenticated reviewer section catalog request should remain unfiltered: ${JSON.stringify(requests.sectionSearches)}`);
  assert(requests.sourceSearches.some((entry) => !entry.authenticated && /or=\(id\.in\.\("PUBLIC_SOURCE"\),source_id\.in\.\("PUBLIC_SOURCE"\)\)/.test(entry.search)), `Public startup catalog request should fetch only referenced sources: ${JSON.stringify(requests.sourceSearches)}`);
  assert(requests.sourceSearches.some((entry) => entry.authenticated && !/or=\(id\.in\./.test(entry.search)), `Authenticated reviewer source catalog request should remain unfiltered: ${JSON.stringify(requests.sourceSearches)}`);
  assert.match(audit.listText, /Authenticated reviewer workup/, `Authenticated catalog should win the startup race: ${JSON.stringify(audit)}`);
  assert.doesNotMatch(audit.listText, /Public startup workup/, `Delayed public catalog must not overwrite authenticated reviewer catalog: ${JSON.stringify(audit)}`);
  assert.match(audit.itemList, /Authenticated reviewer current question/, `Section payload should come from the authenticated catalog: ${JSON.stringify(audit)}`);
  assert.ok(audit.horizontalOverflow <= 2, `Studio should not overflow horizontally after race hydration: ${JSON.stringify(audit)}`);

  console.log("Supabase catalog race checks passed.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
