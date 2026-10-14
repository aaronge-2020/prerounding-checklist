import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Batch A2, Item 2: a demo session object that exists without a stage
// (the state Aaron's live tab was in on 2026-10-13: every render logged
// "stage: undefined" and clicks did nothing) must be treated by the demo
// controller's render() as no session at all: the tour layers come down
// and the app stays usable. The stage-less session is seeded through the
// app's own start path by rewriting the one line of the session module
// that assigns the opening stage, which is exactly the shape a stale or
// mixed module instance produces in a real tab.
const server = await createAppServer();
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
// The service worker is blocked in this context: once it activates it
// fetches the module graph itself, which would bypass the route
// interception below (Playwright routes do not see service-worker
// fetches) and serve the unmodified session module.
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.route(/\/src\/ui\/demo\/session-controller\.js/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    assert.ok(body.includes('stage: "save-context"'), "the session module must assign the opening stage");
    await route.fulfill({ response, body: body.replace('stage: "save-context"', "stage: undefined") });
  });

  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);

  // Start the guided demo: the session is created with no stage.
  await page.click('[data-action="start-guided-demo"]');
  // Give the render cycle room to mount any tour layers it is going to mount.
  await page.waitForTimeout(1500);

  assert.equal(await page.locator("[data-demo-guide]").count(), 0, "no guide bar may be mounted for a stage-less session");
  assert.equal(await page.locator("[data-demo-dim]").count(), 0, "no dim overlay may be mounted for a stage-less session");
  assert.equal(await page.locator("[data-demo-callout]").count(), 0, "no callout may be mounted for a stage-less session");
  assert.equal(await page.locator(".demo-next-action").count(), 0, "no element may be highlighted for a stage-less session");
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("demo-tour-active")),
    false,
    "the tour-active body class must not be set for a stage-less session"
  );

  // Leave the demo through the app's own nav guard (a destination outside
  // the tour's allowed list exits the session and restores the vault).
  await page.click('[data-view-target="vault"]');
  await page.waitForFunction(() => document.querySelector("#vaultView")?.classList.contains("active"));
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector("#dailyContent .source-first-stay");

  // The exact flow that was dead in Aaron's tab: paste a note, review its
  // sections, click "Save & write note", land in the note workspace.
  await page.click('[data-note-mode="paste"]');
  const noteText = [
    "HPI",
    "Synthetic patient with two days of exertional chest pressure, now resolved.",
    "",
    "PHYSICAL EXAM",
    "Alert. Lungs clear.",
    "",
    "ASSESSMENT",
    "Chest pain, likely musculoskeletal.",
    "",
    "PLAN",
    "Observe. Serial troponins."
  ].join("\n");
  await page.locator("[data-structured-note-paste]").fill(noteText);
  await page.click('[data-action="review-structured-note-sections"]');
  assert.equal(await page.locator("[data-note-original]").textContent(), noteText, "original retained in the arrange workspace");
  await page.selectOption("#deidModeSelect", "structured");
  await page.click('[data-action="save-structured-note-to-draft"]');
  await page.locator("#reviewView").waitFor({ state: "visible", timeout: 30000 });
  assert.ok(await page.locator("#reviewContent").textContent(), "Save & write note opens the note workspace");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS: stage-less demo session renders no tour layers and the Save & write note flow completes");
} finally {
  await browser.close();
  await server.close();
}
