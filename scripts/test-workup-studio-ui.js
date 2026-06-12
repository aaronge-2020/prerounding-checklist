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

function authoringTableRequestCount(requests) {
  return requests.getChangeSetsCount
    + requests.postedRows.length
    + requests.patchedRows.length
    + requests.canonicalRows.length
    + requests.deletedRows.length;
}

function magicLinkCallbackUrl(baseUrl, accessToken) {
  const callbackUrl = new URL(`${baseUrl}/index.html`);
  callbackUrl.searchParams.set("workupStudioOAuth", "1");
  callbackUrl.hash = new URLSearchParams({
    access_token: accessToken,
    refresh_token: "fake-refresh-token",
    expires_in: "3600",
    token_type: "bearer"
  }).toString();
  return callbackUrl.toString();
}

function magicLinkCodeCallbackUrl(baseUrl, code) {
  const callbackUrl = new URL(`${baseUrl}/index.html`);
  callbackUrl.searchParams.set("workupStudioOAuth", "1");
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("type", "magiclink");
  return callbackUrl.toString();
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
  const fakeUnassignedUserId = "22222222-2222-4222-8222-222222222222";
  const fakeAuthorUserId = "33333333-3333-4333-8333-333333333333";
  const supabaseRequests = {
    magicLinkCount: 0,
    otpRequests: [],
    pkceTokenCount: 0,
    pkceTokenBodies: [],
    tokenRefreshCount: 0,
    userCount: 0,
    profileCount: 0,
    assignmentCount: 0,
    getChangeSetsCount: 0,
    postedRows: [],
    patchedRows: [],
    canonicalRows: [],
    deletedRows: []
  };
  await page.route("https://hajjuzpnlvpetsleuxwb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/otp" && request.method() === "POST") {
      supabaseRequests.magicLinkCount += 1;
      supabaseRequests.otpRequests.push({
        redirectTo: url.searchParams.get("redirect_to") || "",
        body: JSON.parse(request.postData() || "{}")
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}"
      });
      return;
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      supabaseRequests.pkceTokenCount += 1;
      supabaseRequests.pkceTokenBodies.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-reviewer-token",
          refresh_token: "fake-refresh-token",
          expires_in: 3600,
          user: { id: fakeUserId, email: "reviewer@example.test" }
        })
      });
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      supabaseRequests.tokenRefreshCount += 1;
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
    if (url.pathname === "/auth/v1/user" && request.method() === "GET") {
      supabaseRequests.userCount += 1;
      const authorization = request.headers().authorization || "";
      const isUnassigned = /stale-access-token|fake-unassigned-token/.test(authorization);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: isUnassigned ? fakeUnassignedUserId : fakeUserId,
          email: isUnassigned ? "unassigned@example.test" : "reviewer@example.test"
        })
      });
      return;
    }
    if (url.pathname === "/rest/v1/workup_author_profiles" && request.method() === "GET") {
      supabaseRequests.profileCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: url.search.includes(fakeUnassignedUserId)
          ? JSON.stringify([{ role: "author", display_name: "Unassigned author" }])
          : JSON.stringify([{ role: "reviewer", display_name: "QA reviewer" }])
      });
      return;
    }
    if (url.pathname === "/rest/v1/workup_author_assignments" && request.method() === "GET") {
      supabaseRequests.assignmentCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname === "/rest/v1/change_sets" && request.method() === "GET") {
      supabaseRequests.getChangeSetsCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            schema: "workup_change_set_v1",
            id: "loaded-author-draft",
            workup_id: "hyperglycemia_possible_dka_v1",
            section_key: "clinical_pathway_tree_v1",
            operations: [],
            before_snapshot: null,
            after_snapshot: {
              schema: "clinical_pathway_tree_v1",
              workupId: "hyperglycemia_possible_dka_v1",
              title: "Loaded author draft",
              source_ids: ["ADA_HYPERGLYCEMIC_CRISES_2024"],
              root: {
                id: "loaded_author_root",
                label: "Loaded author draft: verify DKA/HHS triage inputs",
                type: "decision",
                children: []
              }
            },
            source_ids: ["ADA_HYPERGLYCEMIC_CRISES_2024"],
            review_status: "draft",
            export_ready: false,
            author_id: fakeAuthorUserId,
            reviewer_id: null,
            reviewer_notes: "Loaded author draft for reviewer audit.",
            imported_evidence: null,
            created_at: "2026-06-01T00:00:00.000Z",
            reviewed_at: null,
            exported_at: null
          }
        ])
      });
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
    if (/^\/rest\/v1\/(?:workup_sections|pathway_trees|pathway_nodes|workup_items|review_cases)$/.test(url.pathname) && request.method() === "POST") {
      supabaseRequests.canonicalRows.push({
        table: url.pathname.split("/").at(-1),
        rows: JSON.parse(request.postData() || "[]")
      });
      await route.fulfill({ status: 201, contentType: "application/json", body: "" });
      return;
    }
    if (/^\/rest\/v1\/(?:pathway_nodes|workup_items|review_cases)$/.test(url.pathname) && request.method() === "DELETE") {
      supabaseRequests.deletedRows.push({
        table: url.pathname.split("/").at(-1),
        query: url.search
      });
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
      return;
    }
    if (url.pathname === "/rest/v1/workups" && request.method() === "PATCH") {
      supabaseRequests.canonicalRows.push({
        table: "workups",
        rows: [JSON.parse(request.postData() || "{}")]
      });
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: `Unexpected Supabase test request: ${request.method()} ${url.pathname}` });
  });

  await page.goto(`${baseUrl}/index.html?workupStudioUi=${Date.now()}`);
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem("prerounding-workup-authoring-v1", JSON.stringify(state));
  }, {
    selectedModuleId: "hyperglycemia_possible_dka_v1",
    sectionKey: "clinical_pathway_tree_v1",
    changeSets: [],
    backend: {
      url: "https://studio-test.supabase.co",
      anonKey: "stale-key",
      email: "stale-reviewer@example.test",
      accessToken: "stale-access-token",
      refreshToken: "stale-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: fakeUnassignedUserId,
      role: "reviewer",
      canReview: true,
      permittedWorkupIds: ["hyperglycemia_possible_dka_v1"],
      permissionChecked: true,
      sessionValidatedAt: "2026-06-01T00:00:00.000Z"
    }
  });
  await page.goto(`${baseUrl}/index.html?workupStudioUi=${Date.now()}`);
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");

  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await assertNoHorizontalOverflow(page, "desktop Workup Studio");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), true, "Backend drafts should not load before authenticated permission checks.");
  assert.equal(await page.locator("#workupStudioSupabaseUrlInput").count(), 0, "Workup Studio should not expose an editable Supabase URL.");
  assert.equal(await page.locator("#workupStudioSupabaseAnonKeyInput").count(), 0, "Workup Studio should not expose an editable Supabase key.");
  assert.equal(await page.locator("#workupStudioSaveBackendConfigButton").count(), 0, "Workup Studio should not expose a backend config save button.");
  assert.equal(await page.locator("#workupStudioApproveDraftButton").isDisabled(), true, "Cached reviewer state must not unlock publish before token revalidation.");
  assert.match(await page.textContent("#workupStudioApproveDraftButton"), /Reviewer publish locked/, "Cached reviewer state should render as locked until Supabase revalidates permissions.");
  await page.waitForFunction(() => /no Workup Studio assignment/i.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.userCount, 1, "Saved sessions should be revalidated against Supabase Auth before unlocking permissions.");
  assert.equal(supabaseRequests.profileCount, 1, "Saved sessions should recheck author profile.");
  assert.equal(supabaseRequests.assignmentCount, 1, "Saved sessions should recheck delegated assignments.");
  assert.equal(supabaseRequests.getChangeSetsCount, 0, "Stale cached reviewer state must not load backend drafts.");

  await page.fill("#workupStudioSearchInput", "dka");
  await page.waitForFunction(() => document.querySelectorAll("#workupStudioList .studio-workup-row").length > 0);
  await page.locator("#workupStudioList .studio-workup-row", { hasText: "Hyperglycemia" }).first().click();
  await page.waitForFunction(() => document.querySelector("#workupStudioSelectedTitle")?.textContent?.includes("Hyperglycemia"));
  assert.equal(await page.locator("#workupStudioApproveDraftButton").isDisabled(), true, "Reviewer publish should be locked before auth.");
  assert.match(await page.textContent("#workupStudioApproveDraftButton"), /Reviewer publish locked/, "Locked publish button should not imply local approval works.");
  const pathwayPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.match(pathwayPrompt, /workup_section_update_v1/, "Workup Studio should generate a paste-ready OpenEvidence section schema.");
  assert.match(pathwayPrompt, /clinical_pathway_tree_v1/, "Pathway prompt should be scoped to the selected tree section.");
  assert.match(pathwayPrompt, /Do not include patient-specific details/, "OpenEvidence prompt should guard against PHI.");
  const authoringRequestsBeforeLocalDraft = authoringTableRequestCount(supabaseRequests);
  await page.click("#workupStudioSaveTreeDraftButton");
  await page.fill("#workupStudioImportInput", JSON.stringify({
    schema: "clinical_pathway_tree_v1",
    workupId: "hyperglycemia_possible_dka_v1",
    title: "Unauthenticated local-only draft",
    root: {
      id: "local_only_root",
      label: "Local-only pre-auth draft",
      type: "action",
      children: []
    }
  }));
  await page.click("#workupStudioPreviewImportButton");
  await page.click("#workupStudioAcceptImportButton");
  await page.evaluate(() => document.querySelector("#workupStudioLoadBackendDraftsButton")?.click());
  await page.evaluate(() => document.querySelector("#workupStudioPublishImportButton")?.click());
  await page.waitForTimeout(100);
  assert.equal(authoringTableRequestCount(supabaseRequests), authoringRequestsBeforeLocalDraft, "Local draft/import controls must not touch Supabase authoring tables before auth and permission.");
  await page.evaluate(() => localStorage.removeItem("prerounding-workup-authoring-v1"));
  await page.goto(`${baseUrl}/index.html?workupStudioUiClean=${Date.now()}`);
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await page.fill("#workupStudioSearchInput", "dka");
  await page.waitForFunction(() => document.querySelectorAll("#workupStudioList .studio-workup-row").length > 0);
  await page.locator("#workupStudioList .studio-workup-row", { hasText: "Hyperglycemia" }).first().click();
  await page.waitForFunction(() => document.querySelector("#workupStudioSelectedTitle")?.textContent?.includes("Hyperglycemia"));
  const magicLinkCountBeforeInvalidEmail = supabaseRequests.magicLinkCount;
  await page.fill("#workupStudioMagicLinkEmailInput", "not-an-email");
  await page.click("#workupStudioSignInButton");
  await page.waitForFunction(() => /valid assigned account email/i.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.magicLinkCount, magicLinkCountBeforeInvalidEmail, "Invalid emails should not request a Supabase magic link.");
  await page.fill("#workupStudioMagicLinkEmailInput", "unassigned@example.test");
  await page.click("#workupStudioSignInButton");
  await waitForCondition(() => supabaseRequests.magicLinkCount >= 1, "unassigned magic-link request");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.email, "unassigned@example.test", "Magic link should be sent to the typed email.");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.create_user, false, "Magic link should not create arbitrary Supabase users.");
  assert.match(supabaseRequests.otpRequests.at(-1).body.code_challenge, /^[A-Za-z0-9_-]{20,}$/, "Magic link should include a PKCE code challenge.");
  assert.match(supabaseRequests.otpRequests.at(-1).body.code_challenge_method, /^(s256|plain)$/, "Magic link should declare the PKCE challenge method.");
  assert.match(supabaseRequests.otpRequests.at(-1).redirectTo, /workupStudioOAuth=1/, "Magic-link callback should use the configured Workup Studio redirect.");
  await page.goto(magicLinkCallbackUrl(baseUrl, "fake-unassigned-token"));
  await waitForCondition(() => supabaseRequests.profileCount >= 2 && supabaseRequests.assignmentCount >= 2, "unassigned magic-link callback");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForFunction(() => /no Workup Studio assignment/i.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.magicLinkCount, 1, "Unassigned account should request a magic link before permission denial.");
  assert.equal(supabaseRequests.profileCount, 2, "Unassigned account should check profile.");
  assert.equal(supabaseRequests.assignmentCount, 2, "Unassigned account should check assignments.");
  assert.equal(supabaseRequests.getChangeSetsCount, 0, "Unassigned account must not load backend drafts.");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), true, "Backend draft loading must stay locked for unassigned users.");
  assert.equal(await page.locator("#workupStudioApproveDraftButton").isDisabled(), true, "Unassigned account must not be able to publish from the editor.");
  assert.equal(await page.locator("#workupStudioSignOutButton").isHidden(), true, "Sign out should stay hidden when a magic-link account has no Workup Studio permission.");

  await page.fill("#workupStudioMagicLinkEmailInput", "reviewer@example.test");
  await page.click("#workupStudioSignInButton");
  await waitForCondition(() => supabaseRequests.magicLinkCount >= 2, "reviewer magic-link request");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.email, "reviewer@example.test", "Reviewer magic link should use the typed reviewer email.");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.create_user, false, "Reviewer magic link should still require an existing Auth user.");
  assert.match(supabaseRequests.otpRequests.at(-1).body.code_challenge, /^[A-Za-z0-9_-]{20,}$/, "Reviewer magic link should include a PKCE code challenge.");
  await page.goto(magicLinkCodeCallbackUrl(baseUrl, "fake-reviewer-code"));
  await waitForCondition(() => supabaseRequests.profileCount >= 3 && supabaseRequests.assignmentCount >= 3, "reviewer magic-link callback");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForFunction(() => /Reviewer signed in as reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.magicLinkCount, 2, "Workup Studio should request Supabase magic links for sign-in.");
  assert.equal(supabaseRequests.pkceTokenCount, 1, "Workup Studio should exchange PKCE magic-link codes for a session.");
  assert.equal(supabaseRequests.pkceTokenBodies.at(-1).auth_code, "fake-reviewer-code", "PKCE exchange should send the returned auth code.");
  assert.match(supabaseRequests.pkceTokenBodies.at(-1).code_verifier, /^[A-Za-z0-9._~-]{40,}$/, "PKCE exchange should send the stored code verifier.");
  assert.equal(supabaseRequests.profileCount, 3, "Workup Studio should verify the signed-in user's author profile.");
  assert.equal(supabaseRequests.assignmentCount, 3, "Workup Studio should verify delegated workup assignments.");
  assert.equal(supabaseRequests.getChangeSetsCount, 1, "Sign-in should load RLS-filtered backend change sets.");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), false, "Backend draft loading should only unlock after permission checks.");
  assert.equal(await page.locator("#workupStudioApproveDraftButton").isDisabled(), false, "Reviewer account should unlock editor publish.");
  assert.match(await page.textContent("#workupStudioApproveDraftButton"), /Publish latest draft/, "Reviewer button should accurately describe publishing.");
  assert.equal(await page.locator("#workupStudioSignOutButton").isHidden(), false, "Sign out should appear after verified Workup Studio permission.");
  await page.click("#workupStudioApproveDraftButton");
  await waitForCondition(() => supabaseRequests.postedRows.some((row) => row.id === "loaded-author-draft"), "Supabase loaded author draft publish");
  const loadedAuthorDraftRow = supabaseRequests.postedRows.find((row) => row.id === "loaded-author-draft");
  assert.equal(loadedAuthorDraftRow.author_id, fakeAuthorUserId, "Reviewer publish must preserve the original draft author.");
  assert.equal(loadedAuthorDraftRow.reviewer_id, fakeUserId, "Reviewer publish should record the reviewer separately.");

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
  await page.click("#workupStudioPublishImportButton");
  await page.waitForFunction(() => Number(document.querySelector("#workupStudioDraftCount")?.textContent || "0") >= 1);
  await page.waitForFunction(() => /Classify DKA\/HHS/.test(document.querySelector("#workupStudioItemList")?.textContent || ""));
  const pathwayItemListText = await page.textContent("#workupStudioItemList");
  assert.doesNotMatch(pathwayItemListText || "", /Missing data needed/i, "Workup Studio should hide internal missing-data guards from the pathway outline.");
  await page.waitForFunction(() => /Supabase synced/.test(document.querySelector("#workupStudioDiffPreview")?.textContent || ""));
  await waitForCondition(() => supabaseRequests.postedRows.length >= 2, "Supabase draft insert");
  await waitForCondition(() => supabaseRequests.canonicalRows.some((entry) => entry.table === "pathway_trees"), "Supabase pathway tree publish");
  const importedPathwayRow = supabaseRequests.postedRows.find((row) => row.id !== "loaded-author-draft" && row.section_key === "clinical_pathway_tree_v1");
  assert.ok(importedPathwayRow, "OpenEvidence publish should create a separate pathway change-set row.");
  assert.equal(importedPathwayRow.author_id, fakeUserId);
  assert.equal(importedPathwayRow.review_status, "approved");
  assert.equal(importedPathwayRow.export_ready, true);
  assert.equal(importedPathwayRow.section_key, "clinical_pathway_tree_v1");
  assert.ok(supabaseRequests.canonicalRows.some((entry) => entry.table === "workup_sections" && entry.rows.some((row) => row.section_key === "clinical_pathway_tree_v1")), "Publishing should update canonical workup_sections.");
  assert.ok(supabaseRequests.canonicalRows.some((entry) => entry.table === "pathway_nodes" && entry.rows.length >= 1), "Publishing should update canonical pathway_nodes.");
  const importedTreeDraft = JSON.stringify(importedPathwayRow.after_snapshot || {});
  assert.doesNotMatch(importedTreeDraft, /Missing data needed: glucose and ketones/i, "Imported missing-data placeholders should be sanitized out of stored pathway text.");
  assert.match(importedTreeDraft, /Hidden traversal metadata/i, "Imported missing-data guards should remain as hidden traversal metadata.");

  await page.locator("#workupStudioSectionTabs button", { hasText: "History questions" }).click();
  await page.waitForSelector("#workupStudioItemLabelInput");
  const historyPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.match(historyPrompt, /requiredQuestions|conditionalQuestions/, "History prompt should be scoped to history question arrays.");
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
  await waitForCondition(() => supabaseRequests.canonicalRows.some((entry) => entry.table === "workup_items" && entry.rows.some((row) => row.section_key === "history_questions")), "Supabase history item publish");

  await page.locator("#workupStudioJsonDrawer summary").click();
  const exportJsonPreview = await page.inputValue("#workupStudioJsonPreview");
  assert.match(exportJsonPreview, /"clinical_pathway_tree_v1"/, "Advanced export JSON drawer should include the tree section.");
  assert.match(exportJsonPreview, /"requiredQuestions"/, "Advanced export JSON drawer should preserve history questions.");
  assert.doesNotMatch(exportJsonPreview, /Missing data needed: glucose and ketones/i, "Advanced export preview should not expose imported missing-data placeholder labels.");
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
