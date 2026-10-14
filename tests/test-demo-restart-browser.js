import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Batch A3, Item 3: the guided demo must work when it is started from
// Hospital Stay with the primary-note "Review & correct sections"
// workspace already active. In that state the admission note composer
// sits in sections mode, where the floating "Review sections" button
// the parse-note stage (step 5) points at does not exist. On the
// broken build the tour reached step 5 with no highlighted target, no
// callout, and no way forward except Exit demo: the dim covered the
// screen and the guide bar of that action stage had no Continue.
//
// This suite reproduces that exact state first (paste a note, open its
// sections, THEN start the demo), walks the tour to step 5, and
// requires a highlighted target plus a working advance that lands on
// the drug-checks step.
const server = await createAppServer();
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const shotDir = process.env.DEMO_RESTART_SHOT_DIR;
async function screenshot(name) {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}
const guideText = () => page.evaluate(() => document.querySelector("[data-demo-guide]")?.textContent || "");
async function waitForGuide(pattern, timeout = 30000) {
  await page.waitForFunction(
    (source) => new RegExp(source).test(document.querySelector("[data-demo-guide]")?.textContent || ""),
    pattern.source,
    { timeout }
  );
}
// Wait for a review stage to settle: either the guide has advanced to
// the target stage, or an advance action is visible in the expanded
// editor. The review surface mounts asynchronously: after "Add the
// day-one update" swaps in the daily source, the app de-identifies and
// renders for a few hundred milliseconds with no editor on screen at
// all (measured gap: ~360-440ms locally, longer on a loaded runner).
// A one-shot visibility check inside that gap sees no action and
// would throw even though the stage is about to offer one, so the
// stage only counts as offering nothing once this bounded wait
// expires with neither condition met.
async function waitForReviewAdvance(nextPattern, timeout = 15000) {
  const handle = await page.waitForFunction(
    ({ source, actions }) => {
      const guide = document.querySelector("[data-demo-guide]")?.textContent || "";
      if (new RegExp(source).test(guide)) return "guide";
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const offered = actions.some((action) =>
        visible(document.querySelector(`.section-editor.is-expanded [data-action="${action}"]`)));
      return offered ? "action" : false;
    },
    {
      source: nextPattern.source,
      actions: ["confirm-all-section-redactions", "continue-section-review", "keep-reviewed-redaction"]
    },
    { timeout, polling: 100 }
  );
  return handle.jsonValue();
}
// Drive a redaction review stage to completion: Confirm all when it is
// offered, otherwise Continue to the next field, otherwise Accept one.
async function finishReviewStage(nextPattern) {
  for (let step = 0; step < 60; step += 1) {
    if (nextPattern.test(await guideText())) return;
    let settled;
    try {
      settled = await waitForReviewAdvance(nextPattern);
    } catch {
      throw new Error("The guided review offered no visible action to advance with.");
    }
    if (settled === "guide") return;
    const confirmAll = page.locator('.section-editor.is-expanded [data-action="confirm-all-section-redactions"]:visible').first();
    const continueReview = page.locator('.section-editor.is-expanded [data-action="continue-section-review"]:visible').first();
    const keep = page.locator('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]:visible').first();
    if (await confirmAll.count()) await confirmAll.click();
    else if (await continueReview.count()) await continueReview.click();
    else if (await keep.count()) await keep.click();
    // No click landed (the editor re-rendered between the settle wait
    // and the locator checks); loop and settle again rather than throw.
    await page.waitForTimeout(80);
  }
  throw new Error(`The guided review never reached ${nextPattern}.`);
}

try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector("#dailyView.active");

  // Put the admission primary-note workspace into sections mode, the
  // state the supervisor reproduction found the demo stranded in.
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="primary_note"]');
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
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="admission"]');
  await page.waitForSelector('[data-structured-primary-note-scope="admission"][data-note-entry-mode="sections"]');
  await screenshot("hospital-stay-sections-active-before-demo");

  // Start the guided demo from Hospital Stay in exactly this state.
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForSelector("[data-demo-guide]");
  await page.click('[data-action="add-admission-source"]');
  await page.waitForSelector('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]', { timeout: 60000 });
  await finishReviewStage(/Add the day-one update/);
  await page.click('[data-action="add-daily-source"]');
  await finishReviewStage(/Paste a note, get sections/);

  // Step 5: the stage must present a highlighted target (the Review
  // sections button, or the already-open sections workspace) and a
  // callout, and it must offer a working way forward.
  await page.waitForSelector("[data-demo-target]", { timeout: 15000 });
  // The tour's render cycle briefly mounts its layers twice on a stage
  // change (the prepare pass re-renders) and its 250ms reposition pass
  // then re-mounts a single set; assert the settled state the user
  // actually sees: one callout beside the highlighted target.
  await page.waitForFunction(() => document.querySelectorAll("[data-demo-callout]").length === 1, null, { timeout: 10000 });
  assert.equal(
    await page.locator("[data-demo-callout]").count(),
    1,
    "step 5 must show its callout next to a highlighted target, not a bare dim overlay"
  );
  await screenshot("demo-step5-from-hospital-stay");
  const reviewButton = page.locator('[data-demo-target][data-action="review-structured-note-sections"]');
  const continueButton = page.locator('[data-demo-guide] [data-action="advance-guided-demo"]');
  if (await reviewButton.count()) await reviewButton.click();
  else if (await continueButton.count()) await continueButton.click();
  else assert.fail("step 5 offered neither its highlighted Review sections control nor a Continue button");
  await waitForGuide(/Check drug interactions/);
  await screenshot("demo-past-step5-from-hospital-stay");

  // Re-entry sanity: exit and start again from Hospital Stay; the
  // opening stage must render with its highlighted target in place.
  await page.click('[data-action="exit-guided-demo"]');
  await page.waitForFunction(() => !document.querySelector("[data-demo-guide]"));
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForSelector("[data-demo-guide]");
  await page.waitForSelector('[data-demo-target][data-action="add-admission-source"]', { timeout: 15000 });
  await page.click('[data-action="exit-guided-demo"]');
  await page.waitForFunction(() => !document.querySelector("[data-demo-guide]"));

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS: guided demo advances past step 5 when started from Hospital Stay with the sections workspace already active");
} finally {
  await browser.close();
  await server.close();
}
