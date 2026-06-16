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

async function assertPathwayEditorControlsContained(page, label) {
  const audit = await page.evaluate(() => {
    const form = document.querySelector("#workupStudioEditor");
    const formRect = form?.getBoundingClientRect();
    const controls = Array.from(document.querySelectorAll(
      "#workupStudioEditor input, #workupStudioEditor select, #workupStudioEditor textarea, #workupStudioEditor button"
    ));
    const offenders = controls.map((control) => {
      const rect = control.getBoundingClientRect();
      return {
        id: control.id || control.textContent?.trim() || control.tagName,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        formLeft: Math.round(formRect?.left || 0),
        formRight: Math.round(formRect?.right || 0)
      };
    }).filter((entry) => entry.left < Math.round((formRect?.left || 0) - 1)
      || entry.right > Math.round((formRect?.right || 0) + 1));
    const treeShell = document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-shell");
    const shellRect = treeShell?.getBoundingClientRect();
    const toolbar = document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar");
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
    return {
      viewportWidth: document.documentElement.clientWidth,
      form: formRect ? {
        left: Math.round(formRect.left),
        right: Math.round(formRect.right),
        width: Math.round(formRect.width)
      } : null,
      offenders,
      treeShell: shellRect ? {
        left: Math.round(shellRect.left),
        right: Math.round(shellRect.right),
        top: Math.round(shellRect.top),
        bottom: Math.round(shellRect.bottom)
      } : null,
      toolbarInsideShell: Boolean(shellRect && toolbarRect
        && toolbarRect.left >= shellRect.left - 1
        && toolbarRect.right <= shellRect.right + 1
        && toolbarRect.top >= shellRect.top - 1
        && toolbarRect.bottom <= shellRect.bottom + 64),
      toolbarHiddenUntilHover: toolbarStyle ? toolbarStyle.opacity === "0" && toolbarStyle.pointerEvents === "none" : false
    };
  });
  assert.ok(audit.form?.width > 0, `${label}: pathway editor form should be visible: ${JSON.stringify(audit)}`);
  assert.deepEqual(audit.offenders, [], `${label}: pathway editor controls should stay inside the editor form: ${JSON.stringify(audit)}`);
  assert.ok(audit.treeShell?.right > audit.treeShell?.left, `${label}: Cytoscape tree shell should be visible: ${JSON.stringify(audit)}`);
  assert.equal(audit.toolbarInsideShell, true, `${label}: hover toolbar should stay inside the tree shell top area: ${JSON.stringify(audit)}`);
  assert.equal(audit.toolbarHiddenUntilHover, true, `${label}: hover toolbar should stay tucked away until pointer/focus: ${JSON.stringify(audit)}`);
}

async function waitForCondition(callback, label, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function setTextareaValue(page, selector, value) {
  await page.locator(selector).evaluate((node, nextValue) => {
    node.value = nextValue;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function waitForCytoscapeNode(page, nodeId) {
  await page.waitForFunction((id) => {
    const cy = document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape;
    const node = cy?.$id(id);
    if (!cy || !node?.nonempty()) return false;
    const position = node.renderedPosition();
    return Number.isFinite(position.x) && Number.isFinite(position.y);
  }, nodeId);
}

async function cytoscapeNodeScreenPoint(page, nodeId) {
  const point = await page.evaluate((id) => {
    const cy = document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape;
    const node = cy?.$id(id);
    if (!cy || !node?.nonempty()) return null;
    const position = node.renderedPosition();
    const rect = cy.container().getBoundingClientRect();
    return {
      x: rect.left + position.x,
      y: rect.top + position.y
    };
  }, nodeId);
  assert.ok(point, `Cytoscape node ${nodeId} should have a rendered screen point.`);
  return point;
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
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
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
    expiredReviewerTokenFailures: 0,
    userCount: 0,
    profileCount: 0,
    assignmentCount: 0,
    catalogWorkupCount: 0,
    catalogSectionCount: 0,
    catalogSourceCount: 0,
    catalogWorkupAuthHeaders: [],
    catalogWorkupSearches: [],
    catalogSectionSearches: [],
    catalogSourceSearches: [],
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
          access_token: "expired-reviewer-token",
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
      if (/expired-reviewer-token/.test(authorization) && supabaseRequests.expiredReviewerTokenFailures < 1) {
        supabaseRequests.expiredReviewerTokenFailures += 1;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ msg: "invalid JWT" })
        });
        return;
      }
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
    if (url.pathname === "/rest/v1/workups" && request.method() === "GET") {
      supabaseRequests.catalogWorkupCount += 1;
      supabaseRequests.catalogWorkupAuthHeaders.push(request.headers().authorization || "");
      supabaseRequests.catalogWorkupSearches.push(decodeURIComponent(url.search));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "hyperglycemia_possible_dka_v1",
            title: "Supabase Hyperglycemia Workup",
            version: "server-v2",
            status: "mvp",
            complaint_group: "endocrine",
            population: { age_group: "adult" },
            module_path: "medical-knowledge/complaint-modules/hyperglycemia_possible_dka_v1.json",
            source_ids: ["SUPABASE_SOURCE_V2"],
            payload: {
              triggers: ["server dka"],
              applicability: { age_group: "adult" }
            },
            updated_at: "2026-06-12T00:00:00.000Z"
          }
        ])
      });
      return;
    }
    if (url.pathname === "/rest/v1/workup_sections" && request.method() === "GET") {
      supabaseRequests.catalogSectionCount += 1;
      supabaseRequests.catalogSectionSearches.push(decodeURIComponent(url.search));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            workup_id: "hyperglycemia_possible_dka_v1",
            section_key: "clinical_pathway_tree_v1",
            sort_order: 0,
            payload: {
              schema: "clinical_pathway_tree_v1",
              workupId: "hyperglycemia_possible_dka_v1",
              title: "Supabase Hyperglycemia Workup",
              source_ids: ["SUPABASE_SOURCE_V2"],
              root: {
                id: "supabase_root",
                label: "Supabase current DKA root",
                type: "action",
                children: []
              },
              activationRules: {}
            },
            updated_at: "2026-06-12T00:00:00.000Z"
          },
          {
            workup_id: "hyperglycemia_possible_dka_v1",
            section_key: "history_questions",
            sort_order: 1,
            payload: {
              requiredQuestions: [
                {
                  id: "supabase_missed_insulin",
                  item_type: "history_question",
                  label: "Supabase current missed insulin question?",
                  text: "Supabase current missed insulin question?",
                  answerMode: "single",
                  options: ["No missed doses", "Missed basal insulin", "Missed bolus insulin", "Unsure", "Other ___"],
                  normalAnswers: ["No missed doses"],
                  source: { source_id: "SUPABASE_SOURCE_V2" }
                }
              ],
              conditionalQuestions: []
            },
            updated_at: "2026-06-12T00:00:00.000Z"
          },
          {
            workup_id: "hyperglycemia_possible_dka_v1",
            section_key: "physical_exam",
            sort_order: 2,
            payload: {
              requiredExam: [
                {
                  id: "supabase_work_of_breathing",
                  item_type: "physical_exam_maneuver",
                  label: "Supabase current work of breathing exam",
                  technique: "Observe work of breathing at rest.",
                  answerMode: "single",
                  findings_options: ["Comfortable", "Tachypneic", "Kussmaul pattern", "Unable to assess"],
                  normalAnswers: ["Comfortable"],
                  source: { source_id: "SUPABASE_SOURCE_V2" }
                }
              ],
              conditionalExam: []
            },
            updated_at: "2026-06-12T00:00:00.000Z"
          }
        ])
      });
      return;
    }
    if (url.pathname === "/rest/v1/sources" && request.method() === "GET") {
      supabaseRequests.catalogSourceCount += 1;
      supabaseRequests.catalogSourceSearches.push(decodeURIComponent(url.search));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "SUPABASE_SOURCE_V2",
            source_id: "SUPABASE_SOURCE_V2",
            title: "Supabase source v2",
            source_type: "guideline",
            url: "",
            version: "2026",
            citation: "Supabase current source",
            payload: {
              id: "SUPABASE_SOURCE_V2",
              title: "Supabase source v2"
            },
            updated_at: "2026-06-12T00:00:00.000Z"
          }
        ])
      });
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
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= 1, "initial startup public Supabase catalog");
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem("prerounding-workup-authoring-v1", JSON.stringify(state));
  }, {
    selectedModuleId: "acromegaly_v1",
    sectionKey: "clinical_pathway_tree_v1",
    search: "acro",
    statusFilter: "all",
    changeSets: [],
    promptTemplatesBySection: {
      "hyperglycemia_possible_dka_v1::clinical_pathway_tree_v1": 'You are helping improve a reviewed clinical workup knowledge base.\n"schema": "workup_section_update_v1"\n"payload": {"root": {"id": "legacy_root"}}\nCurrent selected-section payload:\n{"root":{"id":"legacy_root"}}'
    },
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
  const staleSessionStartupCatalogBaseline = supabaseRequests.catalogWorkupCount;
  const staleSessionStartupHeaderBaseline = supabaseRequests.catalogWorkupAuthHeaders.length;
  await page.goto(`${baseUrl}/index.html?workupStudioUi=${Date.now()}`);
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= staleSessionStartupCatalogBaseline + 1, "stale-session startup public Supabase catalog");
  const staleSessionStartupHeaders = supabaseRequests.catalogWorkupAuthHeaders.slice(staleSessionStartupHeaderBaseline);
  assert(staleSessionStartupHeaders.some((header) => /sb_publishable_/i.test(header)), `Startup public catalog hydration should use the publishable key even with stale saved auth: ${JSON.stringify(staleSessionStartupHeaders)}`);
  assert(!staleSessionStartupHeaders.some((header) => /stale-access-token/i.test(header)), `Startup public catalog hydration must not depend on a stale saved Workup Studio token: ${JSON.stringify(staleSessionStartupHeaders)}`);
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");

  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  await page.waitForFunction(() => document.querySelector("#workupStudioSelectedTitle")?.textContent?.includes("Hyperglycemia"));
  const patientWorkupStudioAudit = await page.evaluate(() => ({
    selectedTitle: document.querySelector("#workupStudioSelectedTitle")?.textContent?.trim() || "",
    topSelectedTitle: document.querySelector("#workupStudioTopSelectedTitle")?.textContent?.trim() || "",
    topBackendStatus: document.querySelector("#workupStudioTopBackendStatus")?.textContent?.trim() || "",
    searchValue: document.querySelector("#workupStudioSearchInput")?.value || "",
    sectionTitle: document.querySelector("#workupStudioTopSectionTitle")?.textContent?.trim() || "",
    commandbarActions: Array.from(document.querySelectorAll(".studio-commandbar button")).map((button) => button.textContent?.trim()),
    renderedTreeNodes: document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.nodes().length || 0,
    legacyItemRows: document.querySelectorAll("#workupStudioItemList .studio-item-button").length,
    editorBodyMode: document.querySelector(".studio-editor-body")?.classList.contains("is-pathway-editor") || false,
    cytoscapeRenderer: document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-shell")?.dataset.renderer || "",
    navCollapsed: document.body.dataset.navCollapsed,
    shellLeft: Math.round(document.querySelector(".studio-shell")?.getBoundingClientRect().left ?? -1),
    shellRight: Math.round(document.querySelector(".studio-shell")?.getBoundingClientRect().right ?? -1),
    viewportWidth: document.documentElement.clientWidth,
    sidebarPointerEvents: getComputedStyle(document.querySelector("#primarySidebar")).pointerEvents
  }));
  assert.match(patientWorkupStudioAudit.selectedTitle, /Hyperglycemia/, `Studio should open on the active patient workup, not stale cached selection: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.match(patientWorkupStudioAudit.topSelectedTitle, /Hyperglycemia/, `Studio topbar should mirror the active patient workup: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.searchValue, "", `Entering Studio from a patient should clear filters that hide the active workup: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.sectionTitle, "Pathway tree", `Studio should preserve the pathway section when entering from patient workup: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.deepEqual(patientWorkupStudioAudit.commandbarActions, ["Workup settings", "Export", "Import", "Audit log"], `Studio commandbar should expose the concept actions without redundant controls: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.match(patientWorkupStudioAudit.topBackendStatus, /Backend status: sign in to sync|Synced as/i, `Top backend status should be concise and not clip a long auth paragraph: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert(patientWorkupStudioAudit.renderedTreeNodes > 0, `Pathway section should render the tree canvas immediately: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.cytoscapeRenderer, "cytoscape", `Pathway section should use the Cytoscape renderer: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.legacyItemRows, 0, `Pathway section should not show the old long item list: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.editorBodyMode, true, "Pathway section should use tree editing mode on Studio entry.");
  assert.equal(patientWorkupStudioAudit.navCollapsed, "false", `Studio should start with the persistent menu expanded on desktop: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert(patientWorkupStudioAudit.shellLeft >= 180 && patientWorkupStudioAudit.shellLeft <= 380, `Studio shell should start after the resizable primary sidebar on desktop: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert(Math.abs(patientWorkupStudioAudit.shellRight - patientWorkupStudioAudit.viewportWidth) <= 2, `Studio shell should end at the viewport edge without a right gutter: ${JSON.stringify(patientWorkupStudioAudit)}`);
  assert.equal(patientWorkupStudioAudit.sidebarPointerEvents, "auto", `Menu should be usable in Studio when expanded: ${JSON.stringify(patientWorkupStudioAudit)}`);
  const desktopStudioMenuAudit = await page.evaluate(() => {
    const button = document.querySelector("#workupStudioMenuButton");
    const rect = button?.getBoundingClientRect();
    return {
      navCollapsed: document.body.dataset.navCollapsed,
      navOpen: document.body.dataset.studioNavOpen,
      buttonVisible: Boolean(button && getComputedStyle(button).display !== "none" && rect.width > 0 && rect.height > 0),
      shellLeft: Math.round(document.querySelector(".studio-shell")?.getBoundingClientRect().left ?? -1),
      sidebarPointerEvents: getComputedStyle(document.querySelector("#primarySidebar")).pointerEvents
    };
  });
  assert.equal(desktopStudioMenuAudit.buttonVisible, false, `Studio should not show a desktop menu collapse button: ${JSON.stringify(desktopStudioMenuAudit)}`);
  assert.equal(desktopStudioMenuAudit.navCollapsed, "false", `Studio desktop nav should remain expanded: ${JSON.stringify(desktopStudioMenuAudit)}`);
  const studioWorkbenchHandle = page.locator('[data-layout-resize-key="studioWorkups"]');
  await studioWorkbenchHandle.waitFor({ state: "visible" });
  const startStudioWorkupsWidth = await page.evaluate(() => Math.round(document.querySelector(".studio-rail").getBoundingClientRect().width));
  await studioWorkbenchHandle.press("ArrowRight");
  const resizedStudioColumns = await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("prerounding-layout-preferences-v1") || "{}");
    const visibleHandles = Array.from(document.querySelectorAll("#studioView [data-layout-resize-key]")).filter((handle) => {
      const rect = handle.getBoundingClientRect();
      const style = getComputedStyle(handle);
      return style.display !== "none" && rect.width > 0 && rect.height > 0;
    });
    return {
      workupsWidth: Math.round(document.querySelector(".studio-rail").getBoundingClientRect().width),
      storedWorkupsWidth: prefs?.sizes?.studioWorkups,
      visibleHandleCount: visibleHandles.length
    };
  });
  assert(resizedStudioColumns.workupsWidth > startStudioWorkupsWidth && resizedStudioColumns.storedWorkupsWidth >= resizedStudioColumns.workupsWidth - 2 && resizedStudioColumns.visibleHandleCount >= 2, `Studio columns should resize and persist: ${JSON.stringify({ startStudioWorkupsWidth, resizedStudioColumns })}`);
  await assertNoHorizontalOverflow(page, "desktop Workup Studio");
  await assertPathwayEditorControlsContained(page, "desktop Workup Studio pathway editor");
  await page.setViewportSize({ width: 640, height: 900 });
  await page.waitForFunction(() => document.documentElement.clientWidth === 640
    && document.querySelector(".studio-editor-body")?.classList.contains("is-pathway-editor")
    && document.body.dataset.navCollapsed === "true");
  const mobileStudioMenuAudit = await page.evaluate(() => {
    const button = document.querySelector("#workupStudioMenuButton");
    const rect = button?.getBoundingClientRect();
    return {
      buttonVisible: Boolean(button && getComputedStyle(button).display !== "none" && rect.width > 0 && rect.height > 0),
      navCollapsed: document.body.dataset.navCollapsed,
      navOpen: document.body.dataset.studioNavOpen,
      shellLeft: Math.round(document.querySelector(".studio-shell")?.getBoundingClientRect().left ?? -1)
    };
  });
  assert(mobileStudioMenuAudit.buttonVisible && mobileStudioMenuAudit.shellLeft === 0, `Phone-width Studio should show a drawer menu button and use full width: ${JSON.stringify(mobileStudioMenuAudit)}`);
  await page.click("#workupStudioMenuButton");
  await page.waitForFunction(() => document.body.dataset.studioNavOpen === "true");
  await page.waitForFunction(() => (document.querySelector("#primarySidebar")?.getBoundingClientRect().left ?? -999) >= -1);
  const mobileStudioDrawerAudit = await page.evaluate(() => ({
    navCollapsed: document.body.dataset.navCollapsed,
    navOpen: document.body.dataset.studioNavOpen,
    sidebarLeft: Math.round(document.querySelector("#primarySidebar")?.getBoundingClientRect().left || -1),
    sidebarWidth: Math.round(document.querySelector("#primarySidebar")?.getBoundingClientRect().width || 0),
    navLabelsVisible: getComputedStyle(document.querySelector("#sidebarPatientRosterLabel")).display !== "none"
  }));
  assert(mobileStudioDrawerAudit.sidebarLeft >= -1 && mobileStudioDrawerAudit.sidebarWidth >= 180 && mobileStudioDrawerAudit.navLabelsVisible, `Phone-width Studio menu should open a full drawer: ${JSON.stringify(mobileStudioDrawerAudit)}`);
  await page.click("#workupStudioMenuButton");
  await page.waitForFunction(() => document.body.dataset.studioNavOpen === "false");
  await assertNoHorizontalOverflow(page, "phone-width Workup Studio pathway editor");
  await assertPathwayEditorControlsContained(page, "phone-width Workup Studio pathway editor");
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.waitForFunction(() => document.documentElement.clientWidth === 1440
    && document.querySelector(".studio-editor-body")?.classList.contains("is-pathway-editor"));
  await page.click("#workupStudioImportCommandButton");
  await page.waitForFunction(() => document.activeElement?.id === "workupStudioImportInput");
  await page.click("#workupStudioAuditLogButton");
  await page.waitForFunction(() => document.querySelector("#workupStudioJsonDrawer")?.open);
  await page.click("#workupStudioSettingsCommandButton");
  await page.waitForFunction(() => document.activeElement?.id === "workupStudioMagicLinkEmailInput" || document.activeElement?.id === "workupStudioLoadBackendDraftsButton");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), true, "Backend drafts should not load before authenticated permission checks.");
  assert.equal(await page.locator("#workupStudioSupabaseUrlInput").count(), 0, "Workup Studio should not expose an editable Supabase URL.");
  assert.equal(await page.locator("#workupStudioSupabaseAnonKeyInput").count(), 0, "Workup Studio should not expose an editable Supabase key.");
  assert.equal(await page.locator("#workupStudioSaveBackendConfigButton").count(), 0, "Workup Studio should not expose a backend config save button.");
  assert.equal(await page.locator("#workupStudioPublishImportButton").isDisabled(), true, "Cached reviewer state must not unlock publish before token revalidation.");
  assert.match(await page.textContent("#workupStudioPublishImportButton"), /Reviewer publish locked/, "Cached reviewer state should render as locked until Supabase revalidates permissions.");
  await waitForCondition(() => supabaseRequests.profileCount >= 1 && supabaseRequests.assignmentCount >= 1, "stale cached reviewer permission recheck");
  const staleReviewerStatus = await page.textContent("#workupStudioBackendStatus");
  assert.doesNotMatch(staleReviewerStatus, /Reviewer signed in|Can publish reviewed changes/i, `Stale cached reviewer state must not render as authorized: ${staleReviewerStatus}`);
  assert.equal(supabaseRequests.userCount, 1, "Saved sessions should be revalidated against Supabase Auth before unlocking permissions.");
  assert.equal(supabaseRequests.profileCount, 1, "Saved sessions should recheck author profile.");
  assert.equal(supabaseRequests.assignmentCount, 1, "Saved sessions should recheck delegated assignments.");
  assert.equal(supabaseRequests.getChangeSetsCount, 0, "Stale cached reviewer state must not load backend drafts.");

  await page.fill("#workupStudioSearchInput", "dka");
  await page.waitForFunction(() => document.querySelectorAll("#workupStudioList .studio-workup-row").length > 0);
  await page.locator("#workupStudioList .studio-workup-row", { hasText: "Hyperglycemia" }).first().click();
  await page.waitForFunction(() => document.querySelector("#workupStudioSelectedTitle")?.textContent?.includes("Hyperglycemia"));
  assert.equal(await page.locator("#workupStudioPublishImportButton").isDisabled(), true, "Reviewer publish should be locked before auth.");
  assert.match(await page.textContent("#workupStudioPublishImportButton"), /Reviewer publish locked/, "Locked publish button should not imply local approval works.");
  const pathwayPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.equal(await page.locator("#workupStudioOpenEvidencePromptOutput").evaluate((node) => node.readOnly), false, "AI prompt textarea should be editable.");
  assert.match(pathwayPrompt, /Create one compact protocol-style clinical pathway tree/, "Pathway prompt should use the compact tree generator.");
  assert.match(pathwayPrompt, /Workup: hyperglycemia_possible_dka_v1 - /, "Pathway prompt should name the selected workup without dumping the current tree.");
  assert.match(pathwayPrompt, /"boxText"/, "Pathway prompt should request compact display text on every node.");
  assert.match(pathwayPrompt, /Every child of a decision node must have edgeLabel/, "Pathway prompt should keep decision-edge wording.");
  assert.match(pathwayPrompt, /6-12 visible nodes/, "Pathway prompt should keep the compact node budget.");
  assert.match(pathwayPrompt, /Avoid bland labels/, "Pathway prompt should discourage generic node labels.");
  assert.match(pathwayPrompt, /ASCII operators/, "Pathway prompt should avoid threshold symbol encoding issues.");
  assert.doesNotMatch(pathwayPrompt, /requiredQuestions|conditionalQuestions|requiredExam|conditionalExam/, "Pathway prompt must not request history or physical exam arrays.");
  assert.doesNotMatch(pathwayPrompt, /Current clinical_pathway_tree|Full local pathway JSON|Current selected-section payload|workup_section_update_v1|Supabase current DKA root/, "Pathway prompt should not include current-tree context or legacy replacement schema.");
  assert.doesNotMatch(pathwayPrompt, /"supabase_root"|"legacy_root"/, "Pathway prompt should not paste raw current-tree JSON ids or stale saved prompt ids.");
  assert.ok(pathwayPrompt.length < 1800, `Pathway prompt should stay short enough to avoid truncation; saw ${pathwayPrompt.length} chars.`);
  const storedPromptTemplates = await page.evaluate(() => JSON.parse(localStorage.getItem("prerounding-workup-authoring-v1") || "{}").promptTemplatesBySection || {});
  assert(!storedPromptTemplates["hyperglycemia_possible_dka_v1::clinical_pathway_tree_v1"], "Legacy saved tree prompt should be pruned from local Workup Studio state.");
  const editedPromptSentinel = `COPY_SENTINEL_${Date.now()}`;
  await setTextareaValue(page, "#workupStudioOpenEvidencePromptOutput", `${pathwayPrompt}\n\nReviewer focus: ${editedPromptSentinel}`);
  await page.click("#workupStudioCopyPromptButton");
  await page.waitForFunction((sentinel) => navigator.clipboard.readText().then((text) => text.includes(sentinel)).catch(() => false), editedPromptSentinel);
  await page.click("#workupStudioResetPromptButton");
  const resetPathwayPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.doesNotMatch(resetPathwayPrompt, new RegExp(editedPromptSentinel), "Reset should restore the generated section prompt.");
  assert.match(resetPathwayPrompt, /Create one compact protocol-style clinical pathway tree/, "Reset prompt should still target only the selected pathway tree section.");
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
  await page.click("#workupStudioAcceptImportButton");
  await page.evaluate(() => document.querySelector("#workupStudioLoadBackendDraftsButton")?.click());
  await page.evaluate(() => document.querySelector("#workupStudioPublishImportButton")?.click());
  await page.waitForTimeout(100);
  assert.equal(authoringTableRequestCount(supabaseRequests), authoringRequestsBeforeLocalDraft, "Local draft/import controls must not touch Supabase authoring tables before auth and permission.");
  assert.equal(supabaseRequests.getChangeSetsCount, 0, "Unauthenticated Workup Studio should not load protected backend drafts.");
  const publicCatalogCountBeforeCleanLoad = supabaseRequests.catalogWorkupCount;
  await page.evaluate(() => localStorage.removeItem("prerounding-workup-authoring-v1"));
  await page.goto(`${baseUrl}/index.html?workupStudioUiClean=${Date.now()}`);
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= publicCatalogCountBeforeCleanLoad + 1, "public canonical Supabase catalog");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForSelector("#studioView:not([hidden])");
  assert.match(await page.textContent("#workupStudioList"), /Supabase Hyperglycemia Workup/, "Unauthenticated patient devices should hydrate the public Supabase canonical workup catalog.");
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
  await page.waitForFunction(() => /Magic link sent to unassigned@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  await page.goto(magicLinkCallbackUrl(baseUrl, "fake-unassigned-token"));
  await waitForCondition(() => supabaseRequests.profileCount >= 2 && supabaseRequests.assignmentCount >= 2, "unassigned magic-link callback");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  const unassignedStatus = await page.textContent("#workupStudioBackendStatus");
  assert.doesNotMatch(unassignedStatus, /Reviewer signed in|Can publish reviewed changes/i, `Unassigned account must not render as authorized: ${unassignedStatus}`);
  const catalogCountAfterUnassignedDenial = supabaseRequests.catalogWorkupCount;
  assert.equal(supabaseRequests.magicLinkCount, 1, "Unassigned account should request a magic link before permission denial.");
  assert.equal(supabaseRequests.profileCount, 2, "Unassigned account should check profile.");
  assert.equal(supabaseRequests.assignmentCount, 2, "Unassigned account should check assignments.");
  assert.equal(supabaseRequests.getChangeSetsCount, 0, "Unassigned account must not load backend drafts.");
  assert(catalogCountAfterUnassignedDenial >= publicCatalogCountBeforeCleanLoad + 1, "Unassigned account may use public catalog reads but must not unlock protected authoring APIs.");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), true, "Backend draft loading must stay locked for unassigned users.");
  assert.equal(await page.locator("#workupStudioPublishImportButton").isDisabled(), true, "Unassigned account must not be able to publish from the editor.");
  assert.equal(await page.locator("#workupStudioSignOutButton").isHidden(), true, "Sign out should stay hidden when a magic-link account has no Workup Studio permission.");

  const catalogCountBeforeReviewerAuth = supabaseRequests.catalogWorkupCount;
  await page.fill("#workupStudioMagicLinkEmailInput", "reviewer@example.test");
  await page.click("#workupStudioSignInButton");
  await waitForCondition(() => supabaseRequests.magicLinkCount >= 2, "reviewer magic-link request");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.email, "reviewer@example.test", "Reviewer magic link should use the typed reviewer email.");
  assert.equal(supabaseRequests.otpRequests.at(-1).body.create_user, false, "Reviewer magic link should still require an existing Auth user.");
  assert.match(supabaseRequests.otpRequests.at(-1).body.code_challenge, /^[A-Za-z0-9_-]{20,}$/, "Reviewer magic link should include a PKCE code challenge.");
  await page.waitForFunction(() => /Magic link sent to reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  await page.waitForFunction(() => Boolean(localStorage.getItem("prerounding-workup-authoring-pkce-verifier-v1")));
  const reviewerPkceVerifier = await page.evaluate(() => localStorage.getItem("prerounding-workup-authoring-pkce-verifier-v1") || sessionStorage.getItem("prerounding-workup-authoring-pkce-verifier-v1") || "");
  assert.match(reviewerPkceVerifier, /^[A-Za-z0-9._~-]{40,}$/, "Reviewer callback should have a stored PKCE verifier before the email link opens.");
  await page.goto(magicLinkCodeCallbackUrl(baseUrl, "fake-reviewer-code"));
  try {
    await waitForCondition(() => supabaseRequests.profileCount >= 3 && supabaseRequests.assignmentCount >= 3, "reviewer magic-link callback", 10000);
  } catch (error) {
    const callbackStatus = await page.evaluate(() => ({
      view: document.body.dataset.view || "",
      status: document.querySelector("#workupStudioBackendStatus")?.textContent || "",
      location: location.href
    }));
    throw new Error(`${error.message}; counters=${JSON.stringify({
      magicLinkCount: supabaseRequests.magicLinkCount,
      pkceTokenCount: supabaseRequests.pkceTokenCount,
      profileCount: supabaseRequests.profileCount,
      assignmentCount: supabaseRequests.assignmentCount,
      getChangeSetsCount: supabaseRequests.getChangeSetsCount
    })}; callbackStatus=${JSON.stringify(callbackStatus)}; diagnostics=${browserDiagnostics.join(" | ")}`);
  }
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForFunction(() => /Reviewer signed in as reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= catalogCountBeforeReviewerAuth + 1 && supabaseRequests.catalogSectionCount >= 2 && supabaseRequests.catalogSourceCount >= 2, "reviewer canonical Supabase catalog");
  await page.waitForFunction(() => /1 Supabase workup loaded/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.equal(supabaseRequests.magicLinkCount, 2, "Workup Studio should request Supabase magic links for sign-in.");
  assert.equal(supabaseRequests.pkceTokenCount, 1, "Workup Studio should exchange PKCE magic-link codes for a session.");
  assert.equal(supabaseRequests.pkceTokenBodies.at(-1).auth_code, "fake-reviewer-code", "PKCE exchange should send the returned auth code.");
  assert.match(supabaseRequests.pkceTokenBodies.at(-1).code_verifier, /^[A-Za-z0-9._~-]{40,}$/, "PKCE exchange should send the stored code verifier.");
  assert.equal(supabaseRequests.expiredReviewerTokenFailures, 1, "Fresh magic-link sessions should retry once when Supabase rejects the initial access token.");
  assert.equal(supabaseRequests.tokenRefreshCount, 1, "Rejected fresh access tokens should be recovered through the refresh token before denying Workup Studio access.");
  assert.equal(supabaseRequests.profileCount, 3, "Workup Studio should verify the signed-in user's author profile.");
  assert.equal(supabaseRequests.assignmentCount, 3, "Workup Studio should verify delegated workup assignments.");
  assert(supabaseRequests.catalogWorkupCount >= catalogCountBeforeReviewerAuth + 1, "Reviewer sign-in should refresh current canonical Supabase workups.");
  assert(supabaseRequests.catalogSectionCount >= 2, "Reviewer sign-in should refresh current canonical Supabase sections.");
  assert(supabaseRequests.catalogSourceCount >= 2, "Reviewer sign-in should refresh current canonical Supabase sources.");
  assert.equal(supabaseRequests.getChangeSetsCount, 1, "Sign-in should load RLS-filtered backend change sets.");
  assert.match(await page.textContent("#workupStudioList"), /Supabase Hyperglycemia Workup/, "Verified reviewers should see the Supabase canonical workup catalog.");
  assert.equal(await page.locator("#workupStudioLoadBackendDraftsButton").isDisabled(), false, "Backend draft loading should only unlock after permission checks.");
  assert.equal(await page.locator("#workupStudioPublishImportButton").isDisabled(), false, "Reviewer account should unlock editor publish.");
  assert.match(await page.textContent("#workupStudioPublishImportButton"), /Publish latest draft/, "Reviewer button should accurately describe publishing.");
  assert.equal(await page.locator("#workupStudioSignOutButton").isHidden(), false, "Sign out should appear after verified Workup Studio permission.");
  const loadedAuthorPublishHeaderBaseline = supabaseRequests.catalogWorkupAuthHeaders.length;
  const loadedAuthorPublishWorkupSearchBaseline = supabaseRequests.catalogWorkupSearches.length;
  const loadedAuthorPublishSectionSearchBaseline = supabaseRequests.catalogSectionSearches.length;
  const loadedAuthorPublishSourceSearchBaseline = supabaseRequests.catalogSourceSearches.length;
  await page.click("#workupStudioPublishImportButton");
  await waitForCondition(() => supabaseRequests.postedRows.some((row) => row.id === "loaded-author-draft"), "Supabase loaded author draft publish");
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= 2, "canonical catalog refresh after publishing loaded author draft");
  await waitForCondition(() => supabaseRequests.catalogWorkupAuthHeaders.slice(loadedAuthorPublishHeaderBaseline).some((header) => /sb_publishable_/i.test(header)), "public catalog verification after publishing loaded author draft");
  const loadedAuthorPublicWorkupSearches = supabaseRequests.catalogWorkupSearches.slice(loadedAuthorPublishWorkupSearchBaseline);
  const loadedAuthorPublicSectionSearches = supabaseRequests.catalogSectionSearches.slice(loadedAuthorPublishSectionSearchBaseline);
  const loadedAuthorPublicSourceSearches = supabaseRequests.catalogSourceSearches.slice(loadedAuthorPublishSourceSearchBaseline);
  assert.ok(
    loadedAuthorPublicWorkupSearches.some((search) => search.includes("id=eq.hyperglycemia_possible_dka_v1") && search.includes("status=in.(mvp,active,published,reviewed)")),
    `Reviewer publish should verify the public workup row through the same filtered catalog path fresh devices use: ${JSON.stringify(loadedAuthorPublicWorkupSearches)}`
  );
  assert.ok(
    loadedAuthorPublicSectionSearches.some((search) => search.includes('workup_id=in.("hyperglycemia_possible_dka_v1")')),
    `Reviewer publish should verify public section hydration for the published workup: ${JSON.stringify(loadedAuthorPublicSectionSearches)}`
  );
  assert.ok(
    loadedAuthorPublicSourceSearches.some((search) => /or=\(id\.in\./.test(search) && /SUPABASE_SOURCE_V2/.test(search)),
    `Reviewer publish should verify referenced public sources for fresh-device traceability: ${JSON.stringify(loadedAuthorPublicSourceSearches)}`
  );
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
          label: "DKA criteria: beta-hydroxybutyrate >=3.0 plus pH/bicarbonate",
          boxText: "Classify DKA when glucose >=200 mg/dL or known diabetes plus beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+ and pH <7.3 or bicarbonate <18 mmol/L; check potassium before insulin.",
          type: "action",
          children: [
            {
              id: "studio_potassium_stop",
              edgeLabel: "K <3.5 mmol/L",
              label: "Potassium safety: hold insulin when K <3.5",
              boxText: "Hold insulin and replace potassium 10 mmol/h until K >3.5 mmol/L; monitor on telemetry when clinically indicated.",
              type: "action",
              children: [
                {
                  id: "studio_insulin_bundle",
                  edgeLabel: "K >=3.5 mmol/L",
                  label: "Start IV insulin 0.1 units/kg/h",
                  boxText: "Start regular insulin 0.1 units/kg/h; add dextrose when glucose <250 mg/dL and continue insulin until ketones clear and pH/bicarbonate resolves.",
                  type: "action",
                  children: [
                    {
                      id: "studio_reassessment",
                      edgeLabel: "Active treatment",
                      label: "Reassess glucose q1-2h and labs q4h",
                      boxText: "Check bedside glucose q1-2h and electrolytes, creatinine, beta-hydroxybutyrate, and venous pH about q4h; escalate for shock, hypoglycemia, K <3.5, or no improvement after 4-6 h.",
                      type: "decision",
                      children: [
                        {
                          id: "studio_transition",
                          edgeLabel: "Resolved",
                          label: "Transition after DKA resolution",
                          boxText: "Give basal insulin 1-2 h before stopping IV insulin; ensure eating, stable potassium, treated trigger, sick-day education, ketone testing, and follow-up.",
                          type: "endpoint",
                          children: []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };

  await page.fill("#workupStudioImportInput", JSON.stringify(graph, null, 2));
  await page.click("#workupStudioAcceptImportButton");
  await page.click("#workupStudioPublishImportButton");
  await page.waitForFunction(() => Number(document.querySelector("#workupStudioDraftCount")?.textContent || "0") >= 1);
  await waitForCytoscapeNode(page, "studio_ketones");
  await page.waitForFunction(() => {
    const cy = document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape;
    const labels = cy?.nodes().map((node) => node.data("label")).join("\n") || "";
    return /DKA criteria: beta-hydroxybutyrate/.test(labels);
  });
  const renderedTreeAudit = await page.evaluate(() => ({
    treeNodeCount: document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.nodes().length || 0,
    legacyListButtonCount: document.querySelectorAll("#workupStudioItemList .studio-item-button").length,
    selectedNodeId: document.querySelector("#workupStudioPathwayNodeIdDisplay")?.value || "",
    editorBodyMode: document.querySelector(".studio-editor-body")?.classList.contains("is-pathway-editor") || false,
    renderer: document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-shell")?.dataset.renderer || "",
    treeText: document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.nodes().map((node) => node.data("label")).join("\n") || "",
    nodeDetailTextCount: document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.nodes().filter((node) => String(node.data("detail") || "").trim()).length || 0,
    shellClientHeight: document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-shell")?.clientHeight || 0,
    toolbarOpacityBeforeHover: getComputedStyle(document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar")).opacity,
    toolbarPointerEventsBeforeHover: getComputedStyle(document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar")).pointerEvents,
    zoom: document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.zoom() || 0
  }));
  assert(renderedTreeAudit.treeNodeCount >= 2, `Pathway Studio should render an editable tree canvas, not just item rows: ${JSON.stringify(renderedTreeAudit)}`);
  assert.equal(renderedTreeAudit.legacyListButtonCount, 0, `Pathway Studio should not render the old long section-item list: ${JSON.stringify(renderedTreeAudit)}`);
  assert.equal(renderedTreeAudit.editorBodyMode, true, "Pathway Studio should switch the editor body into tree-editing mode.");
  assert.equal(renderedTreeAudit.renderer, "cytoscape", `Pathway Studio should use the Cytoscape renderer: ${JSON.stringify(renderedTreeAudit)}`);
  assert(renderedTreeAudit.nodeDetailTextCount >= 4, `Pathway Studio Cytoscape nodes should keep clinical boxText details in their labels: ${JSON.stringify(renderedTreeAudit)}`);
  assert.match(renderedTreeAudit.treeText, /beta-hydroxybutyrate >=3\.0|K <3\.5|0\.1 units\/kg\/h/, `Pathway Studio tree cards should show clinical thresholds and doses from boxText: ${JSON.stringify(renderedTreeAudit)}`);
  assert(renderedTreeAudit.shellClientHeight >= 500, `Pathway Studio tree shell should provide a full graph workspace: ${JSON.stringify(renderedTreeAudit)}`);
  assert.equal(renderedTreeAudit.toolbarOpacityBeforeHover, "0", `Pathway Studio zoom toolbar should be hidden before hover: ${JSON.stringify(renderedTreeAudit)}`);
  assert.equal(renderedTreeAudit.toolbarPointerEventsBeforeHover, "none", `Hidden toolbar should not catch pointer events before hover: ${JSON.stringify(renderedTreeAudit)}`);
  await page.hover("#workupStudioPathwayTreePanel .cytoscape-tree-shell");
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar")).opacity === "1");
  const toolbarHoverAudit = await page.evaluate(() => {
    const shell = document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-shell")?.getBoundingClientRect();
    const toolbar = document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar")?.getBoundingClientRect();
    return {
      buttonLabels: Array.from(document.querySelectorAll("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar button")).map((button) => button.getAttribute("aria-label")),
      opacity: getComputedStyle(document.querySelector("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar")).opacity,
      insideTopArea: Boolean(shell && toolbar && toolbar.top >= shell.top - 1 && toolbar.bottom <= shell.top + 58 && toolbar.left >= shell.left - 1 && toolbar.right <= shell.right + 1)
    };
  });
  assert.deepEqual(toolbarHoverAudit.buttonLabels, ["Zoom out", "Zoom in", "Fit pathway", "Reset layout"], `Hover toolbar should expose zoom and layout controls: ${JSON.stringify(toolbarHoverAudit)}`);
  assert.equal(toolbarHoverAudit.opacity, "1", `Hover toolbar should be visible on graph hover: ${JSON.stringify(toolbarHoverAudit)}`);
  assert.equal(toolbarHoverAudit.insideTopArea, true, `Hover toolbar should stay in the top tree area: ${JSON.stringify(toolbarHoverAudit)}`);
  await page.locator("#workupStudioPathwayTreePanel .cytoscape-tree-toolbar button[aria-label='Zoom in']").click();
  await page.waitForFunction((beforeZoom) => (document.querySelector("#workupStudioPathwayTreePanel")?._cytoscape?.zoom() || 0) > beforeZoom, renderedTreeAudit.zoom);
  const pathwayItemListText = await page.textContent("#workupStudioItemList");
  assert.doesNotMatch(pathwayItemListText || "", /Missing data needed/i, "Workup Studio should hide internal missing-data guards from the pathway outline.");
  const ketoneClickPoint = await cytoscapeNodeScreenPoint(page, "studio_ketones");
  await page.mouse.click(ketoneClickPoint.x, ketoneClickPoint.y);
  await page.waitForFunction(() => document.querySelector("#workupStudioPathwayNodeIdDisplay")?.value === "studio_ketones");
  await page.waitForFunction(() => /beta-hydroxybutyrate >=3\.0/.test(document.querySelector("#workupStudioPathwayNodeDetailInput")?.value || ""));
  const postedRowsBeforeLayoutDrag = supabaseRequests.postedRows.length;
  await waitForCytoscapeNode(page, "studio_ketones");
  const ketoneDragPoint = await cytoscapeNodeScreenPoint(page, "studio_ketones");
  await page.mouse.move(ketoneDragPoint.x, ketoneDragPoint.y);
  await page.mouse.down();
  await page.mouse.move(ketoneDragPoint.x + 32, ketoneDragPoint.y + 26, { steps: 5 });
  await page.mouse.up();
  await waitForCondition(() => supabaseRequests.postedRows.length > postedRowsBeforeLayoutDrag && supabaseRequests.postedRows.some((row) => {
    if (row.section_key !== "clinical_pathway_tree_v1") return false;
    const stack = [row.after_snapshot?.root].filter(Boolean);
    while (stack.length) {
      const entry = stack.shift();
      if (entry?.id === "studio_ketones" && entry.layout && Number.isFinite(Number(entry.layout.x)) && Number.isFinite(Number(entry.layout.y))) return true;
      stack.push(...(Array.isArray(entry?.children) ? entry.children : []));
    }
    return false;
  }), "Supabase rendered-tree layout draft insert");
  await page.fill("#workupStudioPathwayNodeLabelInput", "Direct tree edit: classify DKA/HHS severity with reviewed criteria.");
  await page.fill("#workupStudioPathwayEdgeLabelInput", "Direct tree edit branch criteria");
  await page.fill("#workupStudioPathwayNodeDetailInput", "Direct tree edit detail: potassium must be >=3.5 mmol/L before insulin, then start 0.1 units/kg/h with q1-2h glucose checks.");
  const postedRowsBeforeTreeEdit = supabaseRequests.postedRows.length;
  await page.click("#workupStudioSaveTreeDraftButton");
  await waitForCondition(() => supabaseRequests.postedRows.length > postedRowsBeforeTreeEdit && supabaseRequests.postedRows.some((row) => (
    row.section_key === "clinical_pathway_tree_v1"
    && row.review_status === "draft"
    && /Direct tree edit: classify DKA\/HHS severity/.test(JSON.stringify(row.after_snapshot || {}))
    && /potassium must be >=3\.5 mmol\/L/.test(JSON.stringify(row.after_snapshot || {}))
  )), "Supabase direct rendered-tree draft insert");
  const directTreeEditRow = [...supabaseRequests.postedRows].reverse().find((row) => row.section_key === "clinical_pathway_tree_v1" && /Direct tree edit: classify DKA\/HHS severity/.test(JSON.stringify(row.after_snapshot || {})));
  assert.ok(directTreeEditRow, "Rendered-tree edit should save a clinical_pathway_tree_v1 draft row.");
  assert.equal(directTreeEditRow.review_status, "draft", "Rendered-tree direct edit should save as a reviewer-gated draft.");
  const directTreeEditedNode = (() => {
    const stack = [directTreeEditRow.after_snapshot?.root].filter(Boolean);
    while (stack.length) {
      const entry = stack.shift();
      if (entry?.id === "studio_ketones") return entry;
      stack.push(...(Array.isArray(entry?.children) ? entry.children : []));
    }
    return null;
  })();
  assert.ok(directTreeEditedNode, "Rendered-tree edit should keep the selected node id in the saved tree.");
  assert.equal(directTreeEditedNode.label, "Direct tree edit: classify DKA/HHS severity with reviewed criteria.", "Rendered-tree node edit should update the selected node label.");
  assert.equal(directTreeEditedNode.edgeLabel, "Direct tree edit branch criteria", "Rendered-tree node edit should update the selected branch criteria.");
  assert.match(directTreeEditedNode.boxText || "", /potassium must be >=3\.5 mmol\/L/, "Rendered-tree node edit should update the selected node detail shown on the card.");
  await waitForCondition(() => supabaseRequests.postedRows.length >= 2, "Supabase draft insert");
  await waitForCondition(() => supabaseRequests.canonicalRows.some((entry) => entry.table === "pathway_trees"), "Supabase pathway tree publish");
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= 3, "canonical catalog refresh after pathway publish");
  assert.ok(supabaseRequests.postedRows.some((row) => row.id !== "loaded-author-draft" && row.section_key === "clinical_pathway_tree_v1" && row.review_status === "draft"), "OpenEvidence save should create a draft before publishing.");
  const importedPathwayRow = supabaseRequests.postedRows.find((row) => row.id !== "loaded-author-draft" && row.section_key === "clinical_pathway_tree_v1" && row.review_status === "approved");
  assert.ok(importedPathwayRow, "OpenEvidence publish should create a separate pathway change-set row.");
  assert.equal(importedPathwayRow.author_id, fakeUserId);
  assert.equal(importedPathwayRow.review_status, "approved");
  assert.equal(importedPathwayRow.export_ready, true);
  assert.equal(importedPathwayRow.section_key, "clinical_pathway_tree_v1");
  assert.ok(supabaseRequests.canonicalRows.some((entry) => entry.table === "workup_sections" && entry.rows.some((row) => row.section_key === "clinical_pathway_tree_v1")), "Publishing should update canonical workup_sections.");
  assert.ok(supabaseRequests.canonicalRows.some((entry) => entry.table === "pathway_nodes" && entry.rows.length >= 1), "Publishing should update canonical pathway_nodes.");
  assert.ok(supabaseRequests.canonicalRows.some((entry) => entry.table === "workups" && entry.rows.some((row) => /^(?:mvp|active|published|reviewed)$/.test(row.status || ""))), "Publishing should patch the canonical workup into a public-catalog status.");
  const importedTreeDraft = JSON.stringify(importedPathwayRow.after_snapshot || {});
  assert.doesNotMatch(importedTreeDraft, /Missing data needed: glucose and ketones/i, "Imported missing-data placeholders should be sanitized out of stored pathway text.");
  assert.match(importedTreeDraft, /Hidden traversal metadata/i, "Imported missing-data guards should remain as hidden traversal metadata.");

  await page.locator("#workupStudioSectionTabs button", { hasText: "History questions" }).click();
  await page.waitForSelector("#workupStudioItemLabelInput");
  assert.match(await page.textContent("#workupStudioItemList"), /Supabase current missed insulin question/, "Supabase section hydration should populate current canonical history questions.");
  assert.ok(await page.locator("#workupStudioItemGroupSelect").isVisible(), "History item editor should expose editable row scope.");
  assert.ok(await page.locator("#workupStudioItemAnswerModeSelect").isVisible(), "History item editor should expose answer mode.");
  assert.ok(await page.locator("#workupStudioItemOptionsInput").isVisible(), "History item editor should expose structured answer options.");
  assert.ok(await page.locator("#workupStudioItemNormalAnswersInput").isVisible(), "History item editor should expose normal/default answers.");
  assert.ok(await page.locator("#workupStudioDeleteItemButton").isVisible(), "History item editor should expose row removal.");
  assert.equal(await page.inputValue("#workupStudioItemGroupSelect"), "requiredQuestions");
  assert.equal(await page.inputValue("#workupStudioItemAnswerModeSelect"), "single");
  assert.match(await page.inputValue("#workupStudioItemOptionsInput"), /Missed basal insulin/, "History editor should hydrate answer options.");
  const historyToolbarAudit = await page.evaluate(() => ({
    toolbarVisible: Boolean(document.querySelector("#workupStudioItemSearchInput")?.getBoundingClientRect().height),
    addVisible: Boolean(document.querySelector("#workupStudioToolbarAddItemButton")?.getBoundingClientRect().height),
    duplicateVisible: Boolean(document.querySelector("#workupStudioToolbarDuplicateItemButton")?.getBoundingClientRect().height),
    deleteVisible: Boolean(document.querySelector("#workupStudioToolbarDeleteItemButton")?.getBoundingClientRect().height),
    toolbarOverflow: Math.round((document.querySelector(".studio-item-toolbar")?.getBoundingClientRect().right || 0) - (document.querySelector(".studio-item-pane")?.getBoundingClientRect().right || 0))
  }));
  assert(historyToolbarAudit.toolbarVisible && historyToolbarAudit.addVisible && historyToolbarAudit.duplicateVisible && historyToolbarAudit.deleteVisible, `History item toolbar should expose search/add/duplicate/delete controls: ${JSON.stringify(historyToolbarAudit)}`);
  assert(historyToolbarAudit.toolbarOverflow <= 1, `History item toolbar should fit inside the editor pane: ${JSON.stringify(historyToolbarAudit)}`);
  const studioCanvasLayoutAudit = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const studioView = document.querySelector("#studioView");
    const shell = document.querySelector(".studio-shell");
    const railRect = document.querySelector(".studio-rail")?.getBoundingClientRect();
    const sectionRect = document.querySelector(".studio-section-rail")?.getBoundingClientRect();
    const editorRect = document.querySelector(".studio-editor")?.getBoundingClientRect();
    const inspectorRect = document.querySelector(".studio-inspector")?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const editorForm = document.querySelector("#workupStudioEditor");
    return {
      viewportHeight: window.innerHeight,
      workspaceExcess: workspace ? workspace.scrollHeight - workspace.clientHeight : null,
      studioViewExcess: studioView ? studioView.scrollHeight - studioView.clientHeight : null,
      shellHeight: Math.round(shellRect?.height || 0),
      shellBottom: Math.round(shellRect?.bottom || 0),
      railHeight: Math.round(railRect?.height || 0),
      sectionHeight: Math.round(sectionRect?.height || 0),
      editorHeight: Math.round(editorRect?.height || 0),
      inspectorHeight: Math.round(inspectorRect?.height || 0),
      firstRowHeight: Math.round((Math.max(railRect?.bottom || 0, sectionRect?.bottom || 0, editorRect?.bottom || 0))
        - (Math.min(railRect?.top || 0, sectionRect?.top || 0, editorRect?.top || 0))),
      firstRowBottom: Math.round(Math.max(railRect?.bottom || 0, sectionRect?.bottom || 0, editorRect?.bottom || 0)),
      inspectorTop: Math.round(inspectorRect?.top || 0),
      editorFormClientHeight: editorForm?.clientHeight || 0,
      editorFormScrollHeight: editorForm?.scrollHeight || 0
    };
  });
  assert(studioCanvasLayoutAudit.workspaceExcess <= 2, `Workup Studio should not make the whole workspace a tall scrolling canvas: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  assert(studioCanvasLayoutAudit.studioViewExcess <= 2, `Workup Studio view should stay viewport-bounded with internal column scroll: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  assert(studioCanvasLayoutAudit.railHeight <= studioCanvasLayoutAudit.firstRowHeight + 1, `Workup list column should stay in the bounded Studio row: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  assert(studioCanvasLayoutAudit.sectionHeight <= studioCanvasLayoutAudit.firstRowHeight + 1, `Section column should stay in the bounded Studio row: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  assert(studioCanvasLayoutAudit.inspectorTop >= studioCanvasLayoutAudit.firstRowBottom - 1, `Stacked prompt workbench should sit below the bounded editor row: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  assert(studioCanvasLayoutAudit.editorFormScrollHeight > studioCanvasLayoutAudit.editorFormClientHeight, `Long item editor form should scroll internally instead of expanding the page: ${JSON.stringify(studioCanvasLayoutAudit)}`);
  const historyItemLayoutAudit = await page.evaluate(() => {
    const paneRect = document.querySelector(".studio-item-pane")?.getBoundingClientRect();
    const editorRect = document.querySelector("#workupStudioEditor")?.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll("#workupStudioItemList .studio-item-button"));
    const lastRowRect = rows.at(-1)?.getBoundingClientRect();
    return {
      rowCount: rows.length,
      paneHeight: Math.round(paneRect?.height || 0),
      emptyBelowLastRow: paneRect && lastRowRect ? Math.round(paneRect.bottom - lastRowRect.bottom) : null,
      formGap: paneRect && editorRect ? Math.round(editorRect.top - paneRect.bottom) : null
    };
  });
  assert(historyItemLayoutAudit.rowCount > 0, `History item table should render editable rows: ${JSON.stringify(historyItemLayoutAudit)}`);
  assert(historyItemLayoutAudit.emptyBelowLastRow <= 64, `History item table should not reserve a large blank grid row below its content: ${JSON.stringify(historyItemLayoutAudit)}`);
  assert(historyItemLayoutAudit.formGap <= 12, `History item editor should sit directly below the compact item table: ${JSON.stringify(historyItemLayoutAudit)}`);
  await page.fill("#workupStudioItemSearchInput", "insulin");
  await page.waitForFunction(() => document.activeElement?.id === "workupStudioItemSearchInput");
  const filteredHistoryCount = await page.locator("#workupStudioItemList .studio-item-button").count();
  assert(filteredHistoryCount > 0, "History item search should keep matching rows visible.");
  await page.fill("#workupStudioItemSearchInput", "");
  const historyPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.match(await page.textContent("#workupStudioToolbarAddItemButton"), /Add question/, "History toolbar should use question-specific add copy.");
  assert.match(historyPrompt, /workup_section_patch_v1/, "History prompt should request patch operations instead of full section replacement.");
  assert.match(historyPrompt, /Reviewer request:/, "History prompt should include an explicit reviewer request slot.");
  assert.match(historyPrompt, /Patient tailoring context:/, "History prompt should include concise de-identified patient context.");
  assert.match(historyPrompt, /possible DKA|missed basal insulin|glucose 318/i, "History prompt should include basic patient details for tailoring.");
  assert.doesNotMatch(historyPrompt, /Demo - DKA consult|single-patient/, "History prompt should not include local patient labels or ids.");
  assert.match(historyPrompt, /Existing section inventory:/, "History prompt should include a compact section inventory.");
  assert.match(historyPrompt, /requiredQuestions \| id:supabase_missed_insulin \| label:/, "History prompt inventory should expose exact item ids for targeted updates.");
  assert.doesNotMatch(historyPrompt, /Current selected-section payload:|"tags"\s*:|"version_date"\s*:/, "History prompt should not paste the full section JSON payload.");
  assert.match(historyPrompt, /requiredQuestions|conditionalQuestions/, "History prompt should be scoped to history question arrays.");
  assert.doesNotMatch(historyPrompt, /"requiredExam"\s*:|"conditionalExam"\s*:/, "History prompt should not include physical exam payload arrays.");
  assert.doesNotMatch(historyPrompt, /stable_question_id/, "History prompt should not seed fake add operations that the model may copy.");
  assert.match(historyPrompt, /answerMode/, "History prompt should request structured answer mode metadata.");
  assert.match(historyPrompt, /never "multiple"/, "History prompt should enforce local answerMode vocabulary.");
  assert.match(historyPrompt, /changed row fields directly on the operation/, "History prompt should describe concise direct update fields.");
  assert.match(historyPrompt, /do not include OpenEvidence citation markup/, "History prompt should reject citation markup artifacts.");
  assert.match(historyPrompt, /normalAnswers/, "History prompt should request structured normal answer metadata.");
  assert.match(historyPrompt, /operations": \[\]/, "History prompt should define no-change behavior.");
  assert(historyPrompt.split("Existing section inventory:")[0].trim().split("\n").length <= 44, "History prompt instructions should stay concise before the inventory.");
  assert(historyPrompt.length < 9000, `History prompt should stay concise; saw ${historyPrompt.length} chars.`);
  const postedRowsBeforeHistoryPatch = supabaseRequests.postedRows.length;
  await page.fill("#workupStudioImportInput", JSON.stringify({
    schema: "workup_section_patch_v1",
    workupId: "hyperglycemia_possible_dka_v1",
    sectionKey: "history_questions",
    summary: "Patch current missed insulin question rationale only.",
    operations: [
      {
        op: "update",
        itemId: "supabase_missed_insulin",
        item: {
          rationale: "Patch import: missed insulin changes DKA risk and discharge readiness."
        }
      }
    ]
  }));
  await page.click("#workupStudioAcceptImportButton");
  await waitForCondition(() => supabaseRequests.postedRows.length > postedRowsBeforeHistoryPatch && supabaseRequests.postedRows.some((row) => (
    row.section_key === "history_questions"
    && /Patch import: missed insulin/.test(JSON.stringify(row.after_snapshot || {}))
    && !("requiredExam" in (row.after_snapshot || {}))
    && !("conditionalExam" in (row.after_snapshot || {}))
  )), "Supabase history patch import draft insert");
  await page.locator("#workupStudioSectionTabs button", { hasText: "Physical exam" }).click();
  await page.waitForSelector("#workupStudioItemLabelInput");
  const physicalExamPrompt = await page.inputValue("#workupStudioOpenEvidencePromptOutput");
  assert.match(await page.textContent("#workupStudioToolbarAddItemButton"), /Add exam item/, "Physical exam toolbar should use exam-specific add copy.");
  assert.match(physicalExamPrompt, /workup_section_patch_v1/, "Physical exam prompt should request patch operations instead of full section replacement.");
  assert.match(physicalExamPrompt, /Reviewer request:/, "Physical exam prompt should include an explicit reviewer request slot.");
  assert.match(physicalExamPrompt, /Patient tailoring context:/, "Physical exam prompt should include concise de-identified patient context.");
  assert.match(physicalExamPrompt, /possible DKA|HR 112|glucose 318/i, "Physical exam prompt should include basic patient details for tailoring.");
  assert.doesNotMatch(physicalExamPrompt, /Demo - DKA consult|single-patient/, "Physical exam prompt should not include local patient labels or ids.");
  assert.match(physicalExamPrompt, /Existing section inventory:/, "Physical exam prompt should include a compact section inventory.");
  assert.match(physicalExamPrompt, /requiredExam \| id:/, "Physical exam prompt inventory should expose exact exam item ids for targeted updates.");
  assert.doesNotMatch(physicalExamPrompt, /Current selected-section payload:|"tags"\s*:|"version_date"\s*:/, "Physical exam prompt should not paste the full section JSON payload.");
  assert.match(physicalExamPrompt, /requiredExam|conditionalExam/, "Physical exam prompt should be scoped to exam maneuver arrays.");
  assert.doesNotMatch(physicalExamPrompt, /"requiredQuestions"\s*:|"conditionalQuestions"\s*:/, "Physical exam prompt should not include history question payload arrays.");
  assert.doesNotMatch(physicalExamPrompt, /stable_exam_item_id/, "Physical exam prompt should not seed fake add operations that the model may copy.");
  assert.match(physicalExamPrompt, /never "multiple"/, "Physical exam prompt should enforce local answerMode vocabulary.");
  assert.match(physicalExamPrompt, /changed row fields directly on the operation/, "Physical exam prompt should describe concise direct update fields.");
  assert.match(physicalExamPrompt, /do not include OpenEvidence citation markup/, "Physical exam prompt should reject citation markup artifacts.");
  assert.match(physicalExamPrompt, /operations": \[\]/, "Physical exam prompt should define no-change behavior.");
  assert(physicalExamPrompt.split("Existing section inventory:")[0].trim().split("\n").length <= 44, "Physical exam prompt instructions should stay concise before the inventory.");
  assert(physicalExamPrompt.length < 9000, `Physical exam prompt should stay concise; saw ${physicalExamPrompt.length} chars.`);
  const postedRowsBeforeExamPatch = supabaseRequests.postedRows.length;
  await page.fill("#workupStudioImportInput", JSON.stringify({
    schema: "workup_section_patch_v1",
    workupId: "hyperglycemia_possible_dka_v1",
    sectionKey: "physical_exam",
    summary: "Patch current work of breathing exam rationale only.",
    operations: [
      {
        op: "update",
        itemId: "supabase_work_of_breathing",
        item: {
          rationale: "Patch import: work of breathing changes escalation threshold."
        }
      }
    ]
  }));
  await page.click("#workupStudioAcceptImportButton");
  await waitForCondition(() => supabaseRequests.postedRows.length > postedRowsBeforeExamPatch && supabaseRequests.postedRows.some((row) => (
    row.section_key === "physical_exam"
    && /Patch import: work of breathing/.test(JSON.stringify(row.after_snapshot || {}))
    && !("requiredQuestions" in (row.after_snapshot || {}))
    && !("conditionalQuestions" in (row.after_snapshot || {}))
  )), "Supabase physical exam patch import draft insert");
  await page.locator("#workupStudioSectionTabs button", { hasText: "History questions" }).click();
  await page.waitForSelector("#workupStudioItemLabelInput");
  await page.selectOption("#workupStudioItemGroupSelect", "conditionalQuestions");
  await page.selectOption("#workupStudioItemAnswerModeSelect", "multi");
  await page.fill("#workupStudioItemLabelInput", "Studio test: ask about missed insulin, vomiting, and oral intake?");
  await page.fill("#workupStudioItemOptionsInput", "No missed doses\nMissed basal insulin\nMissed bolus insulin\nVomiting\nPoor oral intake\nOther ___");
  await page.fill("#workupStudioItemNormalAnswersInput", "No missed doses");
  await page.click("#workupStudioSaveItemDraftButton");
  await page.waitForFunction(() => Number(document.querySelector("#workupStudioDraftCount")?.textContent || "0") >= 2);
  await waitForCondition(() => supabaseRequests.postedRows.some((row) => row.section_key === "history_questions"), "Supabase history draft insert");
  const historyRow = [...supabaseRequests.postedRows].reverse().find((row) => row.section_key === "history_questions");
  assert.equal(historyRow.author_id, fakeUserId);
  assert.ok(historyRow.after_snapshot.requiredQuestions || historyRow.after_snapshot.conditionalQuestions, "Backend row should store only the edited section payload.");
  assert.equal(historyRow.after_snapshot.requiredQuestions.length, 0, "Changing scope should move the edited question out of requiredQuestions.");
  const editedHistoryQuestion = historyRow.after_snapshot.conditionalQuestions[0];
  assert.equal(editedHistoryQuestion.item_type, "history_question");
  assert.equal(editedHistoryQuestion.answerMode, "multi");
  assert.deepEqual(editedHistoryQuestion.options, ["No missed doses", "Missed basal insulin", "Missed bolus insulin", "Vomiting", "Poor oral intake", "Other ___"]);
  assert.deepEqual(editedHistoryQuestion.normalAnswers, ["No missed doses"]);

  await page.click("#workupStudioPublishImportButton");
  await waitForCondition(() => supabaseRequests.patchedRows.length >= 1, "Supabase approval patch");
  assert.deepEqual(supabaseRequests.patchedRows.at(-1), {
    review_status: "approved",
    export_ready: true,
    reviewer_id: fakeUserId,
    reviewed_at: supabaseRequests.patchedRows.at(-1).reviewed_at
  });
  assert.match(supabaseRequests.patchedRows.at(-1).reviewed_at, /^\d{4}-\d{2}-\d{2}T/);
  await waitForCondition(() => supabaseRequests.canonicalRows.some((entry) => entry.table === "workup_items" && entry.rows.some((row) => row.section_key === "history_questions")), "Supabase history item publish");
  const publishedHistoryRows = supabaseRequests.canonicalRows.find((entry) => entry.table === "workup_items" && entry.rows.some((row) => row.section_key === "history_questions"))?.rows || [];
  const publishedHistoryQuestion = publishedHistoryRows.find((row) => row.section_key === "history_questions" && row.group_key === "conditionalQuestions");
  assert.ok(publishedHistoryQuestion, "Published workup_items row should retain the edited conditional question scope.");
  assert.equal(publishedHistoryQuestion.payload.answerMode, "multi");
  assert.deepEqual(publishedHistoryQuestion.payload.options, ["No missed doses", "Missed basal insulin", "Missed bolus insulin", "Vomiting", "Poor oral intake", "Other ___"]);
  assert.deepEqual(publishedHistoryQuestion.payload.normalAnswers, ["No missed doses"]);
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= 4, "canonical catalog refresh after history publish");

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

  await page.locator("#workupStudioSectionTabs button", { hasText: "Physical exam" }).click();
  await page.waitForSelector("#workupStudioItemOptionsInput");
  assert.match(await page.inputValue("#workupStudioItemOptionsInput"), /Kussmaul pattern/, "Physical exam editor should hydrate findings_options into the option editor.");
  await page.selectOption("#workupStudioItemAnswerModeSelect", "single");
  await page.fill("#workupStudioItemOptionsInput", "Comfortable\nMildly increased work\nKussmaul pattern\nUnable to assess");
  await page.fill("#workupStudioItemNormalAnswersInput", "Comfortable");
  await page.click("#workupStudioSaveItemDraftButton");
  await waitForCondition(() => supabaseRequests.postedRows.some((row) => row.section_key === "physical_exam"), "Supabase physical exam draft insert");
  const examRow = supabaseRequests.postedRows.filter((row) => row.section_key === "physical_exam").at(-1);
  assert.deepEqual(examRow.after_snapshot.requiredExam[0].findings_options, ["Comfortable", "Mildly increased work", "Kussmaul pattern", "Unable to assess"]);
  assert.equal(examRow.after_snapshot.requiredExam[0].options, undefined, "Physical exam saves should use native findings_options instead of stale options.");
  assert.deepEqual(examRow.after_snapshot.requiredExam[0].normalAnswers, ["Comfortable"]);

  const catalogCountBeforeSavedSessionStartup = supabaseRequests.catalogWorkupCount;
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem("prerounding-workup-authoring-v1", JSON.stringify(state));
  }, {
    selectedModuleId: "hyperglycemia_possible_dka_v1",
    sectionKey: "history_questions",
    changeSets: [],
    backend: {
      url: "https://studio-test.supabase.co",
      anonKey: "stale-key",
      email: "reviewer@example.test",
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: fakeUserId,
      role: "reviewer",
      canReview: true,
      permittedWorkupIds: ["hyperglycemia_possible_dka_v1"],
      permissionChecked: true,
      sessionValidatedAt: "2026-06-12T00:00:00.000Z"
    }
  });
  await page.goto(`${baseUrl}/index.html?workupStudioSavedSession=${Date.now()}`);
  await waitForCondition(() => supabaseRequests.catalogWorkupCount >= catalogCountBeforeSavedSessionStartup + 1, "saved session canonical catalog on startup");
  await page.click("#demoCaseButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess");
  await page.click('button[data-view-target="studio"]');
  await page.waitForFunction(() => /Reviewer signed in as reviewer@example\.test/.test(document.querySelector("#workupStudioBackendStatus")?.textContent || ""));
  assert.match(await page.textContent("#workupStudioList"), /Supabase Hyperglycemia Workup/, "Saved authenticated sessions should hydrate the Supabase canonical workup catalog on app startup.");
  await page.click("#sidebarPatientRosterButton");
  await page.waitForFunction(() => document.body.dataset.view === "workspace");
  await page.click('button[data-patient-tab="workup"]');
  await page.fill("#patientWorkupConcernInput", "server dka");
  await page.waitForFunction(() => /Supabase Hyperglycemia Workup/.test(document.querySelector("#patientWorkupResults")?.textContent || ""));
  await page.locator("#patientWorkupResults .workup-result-row", { hasText: "Supabase Hyperglycemia Workup" }).first().click();
  await page.waitForFunction(() => /Supabase Hyperglycemia Workup/.test(document.querySelector("#patientValidatedIntentLabel")?.textContent || ""));
  await page.waitForFunction(() => /Supabase current DKA root/.test(document.querySelector("#patientDecisionTreePanel")?.textContent || ""));
  assert.match(await page.textContent("#patientValidatedIntentLabel"), /Supabase Hyperglycemia Workup/, "Second-device startup should use Supabase workup titles in the patient workspace.");
  assert.match(await page.textContent("#patientDecisionTreePanel"), /Supabase current DKA root/, "Second-device startup should use Supabase clinical pathway sections in the patient workspace.");
  await page.locator('button[data-patient-tab="checklist"]').evaluate((button) => button.click());
  await page.waitForFunction(() => document.body.dataset.patientTab === "checklist");
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  assert.match(await page.textContent("#workspaceChecklistDirectory"), /Supabase current missed insulin question/i, "Second-device patient checklist should build from the current public Supabase section payload.");
  assert.doesNotMatch(await page.textContent("#workspaceChecklistStatus"), /server update available/i, "Fresh server-built patient checklists should not be marked stale.");

  const expectedRetryDiagnostics = browserDiagnostics.filter((entry) => /status of 401/i.test(entry));
  assert.ok(expectedRetryDiagnostics.length <= 1, expectedRetryDiagnostics.join("\n"));
  const unexpectedBrowserDiagnostics = browserDiagnostics.filter((entry) => !/favicon/i.test(entry) && !/status of 401/i.test(entry));
  assert.equal(unexpectedBrowserDiagnostics.length, 0, unexpectedBrowserDiagnostics.join("\n"));

  console.log("Workup Studio UI authoring tests passed.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
