import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
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
const browserDiagnostics = [];

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(root, `.${relativePath}`);
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

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const rootElement = document.scrollingElement || document.documentElement;
    return rootElement.scrollWidth - document.documentElement.clientWidth;
  });
  assert.ok(overflow <= 2, `${label}: horizontal overflow ${overflow}px`);
}

async function waitForCondition(callback, label, timeoutMs = 5000) {
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
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 980 }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserDiagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserDiagnostics.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  const fakeUserId = "11111111-1111-4111-8111-111111111111";
  const supabaseRequests = {
    authCount: 0,
    getChangeSetsCount: 0,
    postedRows: [],
    patchedRows: []
  };
  await page.route("https://studio-test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/token") {
      supabaseRequests.authCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-access-token",
          refresh_token: "fake-refresh-token",
          expires_in: 3600,
          user: { id: fakeUserId, email: "reviewer@example.test" }
        })
      });
      return;
    }
    if (url.pathname === "/rest/v1/change_sets" && request.method() === "GET") {
      supabaseRequests.getChangeSetsCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname === "/rest/v1/change_sets" && request.method() === "POST") {
      supabaseRequests.postedRows.push(...JSON.parse(request.postData() || "[]"));
      await route.fulfill({ status: 201, contentType: "application/json", body: "" });
      return;
    }
    if (url.pathname === "/rest/v1/change_sets" && request.method() === "PATCH") {
      supabaseRequests.patchedRows.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: `Unexpected Supabase test request: ${request.method()} ${url.pathname}` });
  });

  await page.goto(`${baseUrl}/index.html?workupStudioUi=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html?workupStudioUi=${Date.now()}`);
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");

  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await assertNoHorizontalOverflow(page, "desktop Workup Studio");

  await page.fill("#workupStudioSearchInput", "dka");
  await page.waitForFunction(() => document.querySelectorAll("#workupStudioList .studio-workup-row").length > 0);
  await page.locator("#workupStudioList .studio-workup-row", { hasText: "Hyperglycemia" }).first().click();
  await page.waitForFunction(() => document.querySelector("#workupStudioSelectedTitle")?.textContent?.includes("Hyperglycemia"));
  await page.fill("#workupStudioSupabaseUrlInput", "https://studio-test.supabase.co");
  await page.fill("#workupStudioSupabaseAnonKeyInput", "fake-anon-key");
  await page.fill("#workupStudioSupabaseEmailInput", "reviewer@example.test");
  await page.fill("#workupStudioSupabasePasswordInput", "correct horse battery staple");
  await page.click("#workupStudioSignInButton");
  await page.waitForFunction(() => /Signed in as reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.authCount, 1, "Workup Studio should sign in through Supabase Auth.");
  assert.equal(supabaseRequests.getChangeSetsCount, 1, "Sign-in should load RLS-filtered backend change sets.");

  const graph = {
    schema: "clinical_pathway_tree_v1",
    workupId: "hyperglycemia_possible_dka_v1",
    title: "Studio UI test pathway",
    source_ids: ["ADA_HYPERGLYCEMIC_CRISES_2024"],
    activationRules: { concern_regex: "dka|hyperglycemia" },
    root: {
      id: "studio_root",
      label: "Studio test: confirm hyperglycemic crisis context",
      type: "decision",
      children: [
        {
          id: "studio_missing_labs",
          edgeLabel: "Missing data needed: glucose and ketones",
          label: "Missing data needed: glucose and ketones",
          type: "endpoint",
          endpoint_type: "missing_data_needed",
          missing_data_needed: ["glucose", "ketones"]
        },
        {
          id: "studio_ketones",
          edgeLabel: "DKA concern",
          label: "Classify DKA/HHS with serum beta-hydroxybutyrate, venous pH, bicarbonate, anion gap, potassium, sodium-corrected osmolality, creatinine, and mental status.",
          type: "action",
          children: []
        }
      ]
    }
  };

  await page.fill("#workupStudioImportInput", JSON.stringify(graph, null, 2));
  await page.click("#workupStudioPreviewImportButton");
  await page.waitForFunction(() => /2 clinical nodes will replace only clinical_pathway_tree_v1/.test(document.querySelector("#workupStudioDiffPreview")?.textContent || ""));
  await page.click("#workupStudioAcceptImportButton");
  await page.waitForFunction(() => Number(document.querySelector("#workupStudioDraftCount")?.textContent || "0") >= 1);
  await page.waitForFunction(() => /Classify DKA\/HHS/.test(document.querySelector("#workupStudioItemList")?.textContent || ""));
  const pathwayItemListText = await page.textContent("#workupStudioItemList");
  assert.doesNotMatch(pathwayItemListText || "", /Missing data needed/i, "Workup Studio should hide internal missing-data guards from the pathway outline.");
  await page.waitForFunction(() => /Supabase synced/.test(document.querySelector("#workupStudioDiffPreview")?.textContent || ""));
  await waitForCondition(() => supabaseRequests.postedRows.length >= 1, "Supabase draft insert");
  assert.equal(supabaseRequests.postedRows[0].author_id, fakeUserId);
  assert.equal(supabaseRequests.postedRows[0].review_status, "draft");
  assert.equal(supabaseRequests.postedRows[0].export_ready, false);
  assert.equal(supabaseRequests.postedRows[0].section_key, "clinical_pathway_tree_v1");

  await page.locator("#workupStudioSectionTabs button", { hasText: "History questions" }).click();
  await page.waitForSelector("#workupStudioItemLabelInput");
  await page.fill("#workupStudioItemLabelInput", "Studio test: ask about missed insulin, vomiting, and oral intake?");
  await page.click("#workupStudioSaveItemDraftButton");
  await page.waitForFunction(() => Number(document.querySelector("#workupStudioDraftCount")?.textContent || "0") >= 2);
  await waitForCondition(() => supabaseRequests.postedRows.some((row) => row.section_key === "history_questions"), "Supabase history draft insert");
  const historyRow = supabaseRequests.postedRows.find((row) => row.section_key === "history_questions");
  assert.equal(historyRow.author_id, fakeUserId);
  assert.ok(historyRow.after_snapshot.requiredQuestions || historyRow.after_snapshot.conditionalQuestions, "Backend row should store only the edited section payload.");

  await page.click("#workupStudioApproveDraftButton");
  await waitForCondition(() => supabaseRequests.patchedRows.length >= 1, "Supabase approval patch");
  assert.deepEqual(supabaseRequests.patchedRows.at(-1), {
    review_status: "approved",
    export_ready: true,
    reviewer_id: fakeUserId,
    reviewed_at: supabaseRequests.patchedRows.at(-1).reviewed_at
  });
  assert.match(supabaseRequests.patchedRows.at(-1).reviewed_at, /^\d{4}-\d{2}-\d{2}T/);

  await page.locator("#workupStudioJsonDrawer summary").click();
  const exportJsonPreview = await page.inputValue("#workupStudioJsonPreview");
  assert.match(exportJsonPreview, /"clinical_pathway_tree_v1"/, "Advanced export JSON drawer should include the tree section.");
  assert.match(exportJsonPreview, /"requiredQuestions"/, "Advanced export JSON drawer should preserve history questions.");
  assert.doesNotMatch(exportJsonPreview, /raw chart|MRN|DOB|room number/i, "Authoring export preview should not expose patient identifiers.");

  const downloadPromise = page.waitForEvent("download");
  await page.click("#workupStudioExportPatchButton");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /history_questions-change-set\.json$/);
  const downloadPath = await download.path();
  const exportedPatch = JSON.parse(readFileSync(downloadPath, "utf8"));
  assert.equal(exportedPatch.schema, "workup_change_set_v1");
  assert.equal(exportedPatch.sectionKey, "history_questions");
  assert.equal(exportedPatch.workupId, "hyperglycemia_possible_dka_v1");
  assert.ok(Array.isArray(exportedPatch.operations), "Exported patch should use the review/audit operations format.");

  const storedDrafts = await page.evaluate(() => localStorage.getItem("prerounding-workup-authoring-v1") || "");
  assert.doesNotMatch(storedDrafts, /raw chart|MRN|DOB|patient identifier|room number/i, "Workup Studio local drafts should stay PHI-free.");
  assert.equal(browserDiagnostics.filter((entry) => !/favicon/i.test(entry)).length, 0, browserDiagnostics.join("\n"));

  console.log("Workup Studio UI authoring tests passed.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
