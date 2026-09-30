import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const appUrl = fileAppUrl();
// DEMO_BROWSER=firefox uses Playwright's bundled Firefox (no local-network
// access block, reliable file:// module loads); default is system Chromium.
const browser = process.env.DEMO_BROWSER === "firefox"
  ? await firefox.launch()
  : await chromium.launch({
    executablePath: "/opt/meta-chromium/chrome",
    args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
  });
const page = await browser.newPage({
  viewport: process.env.DEMO_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 820 }
});
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  if (process.env.DEMO_BROWSER !== "firefox")
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  // file:// module loads flake under concurrency in this Chromium; a fresh
  // reload re-requests the failed modules, so retry the initial load.
  let loaded = false;
  for (let attempt = 0; attempt < 4 && !loaded; attempt++) {
    if (attempt > 0) await page.reload();
    else await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector("#vaultPassphrase", { timeout: 20000 });
      loaded = true;
    } catch {
      console.log(`initial load attempt ${attempt + 1} hit the file:// flake, reloading`);
    }
  }
  assert.ok(loaded, "the app must render the vault gate after retries");
  await page.waitForFunction(() => document.querySelectorAll('.primary-nav [data-view-target]').length === 12);
  assert.deepEqual(
    await page.locator('.primary-nav [data-view-target]').evaluateAll((buttons) => buttons.map((button) => button.dataset.viewTarget)),
    ["vault", "daily", "review", "aiChat", "prompts", "quickDeid", "scribePro", "cheatSheets", "drugLookup", "drugChecks", "scores", "settings"],
    "the visible nav must keep Drug Lookup and add the offline Drug checks view"
  );
  assert.deepEqual(
    await page.locator('main .view').evaluateAll((views) => views.map((view) => view.id)),
    ["vaultView", "dailyView", "cheatSheetsView", "reviewView", "promptsView", "quickDeidView", "aiChatView", "drugLookupView", "drugChecksView", "scoresView", "settingsView", "scribeProView"],
    "the document order must match the visible workflow"
  );
  await page.fill("#vaultPassphrase", "guided demo test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="start-guided-demo"]');
  await page.click('[data-action="add-admission-source"]');
  await page.waitForSelector('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]', { timeout: 60000 });

  const reviewHeading = page.locator(".section-editor.is-expanded .redaction-review-heading strong");
  const initialPending = Number((await reviewHeading.innerText()).match(/\d+/)?.[0]);
  await page.click('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]');
  await page.click('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]');

  assert.equal(await page.locator(".section-editor.is-expanded").count(), 1, "individual Accept must keep the active review expanded");
  assert.equal(await page.locator('[data-demo-guide]').filter({ hasText: "Step 2" }).count(), 1, "the guide must not advance while redactions remain");
  assert.equal(await page.locator('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]').isVisible(), true);
  const remainingPending = Number((await reviewHeading.innerText()).match(/\d+/)?.[0]);
  assert.equal(remainingPending, initialPending - 2);

  await page.click('.section-editor.is-expanded [data-action="confirm-all-section-redactions"]');
  await page.waitForFunction(() => document.querySelector("[data-demo-guide]")?.textContent.includes("Add the day-one update"));
  assert.equal(await page.locator('[data-action="add-daily-source"]').isVisible(), true, "Confirm all must remain usable after individual accepts");

  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => /Check the day-one changes|Paste a note, get sections/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  for (let step = 0; step < 30; step += 1) {
    if (/Paste a note, get sections/.test(await page.locator("[data-demo-guide]").innerText())) break;
    const confirmRest = page.locator('.section-editor.is-expanded [data-action="confirm-all-section-redactions"]:visible').first();
    const continueReview = page.locator('.section-editor.is-expanded [data-action="continue-section-review"]:visible').first();
    if (await confirmRest.count()) await confirmRest.click();
    else if (await continueReview.count()) await continueReview.click();
    else throw new Error("The guided daily review did not offer a next visible action.");
    await page.waitForTimeout(50);
  }
  // Pasted-note parsing stop: the tour prefilled a synthetic admission note and
  // the deterministic parser must have sectioned it with no model involved.
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Paste a note, get sections/);
  await page.waitForSelector('[data-structured-note-detected="admission"] .structured-note-detected-list', { timeout: 15000 });
  assert.match(await page.locator('[data-structured-note-detected="admission"]').innerText(), /History of present illness|Medications/i);
  await page.click('[data-action="advance-guided-demo"]');
  await page.waitForFunction(() => /Check drug interactions/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));

  // Drug-interaction stop: the tour prefilled warfarin + fluconazole and the
  // on-device DDInter/RxNorm check must surface a Major interaction card.
  await page.click('[data-view-target="drugChecks"]');
  await page.waitForFunction(() => /Run the interaction check/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("#drugChecksInput").inputValue(), /warfarin/i);
  await page.click('[data-action="drug-checks-check"]');
  await page.waitForSelector(".dc-interaction-card", { timeout: 120000 });
  assert.match(await page.locator("#drugChecksResults").innerText(), /Major/i);
  await page.waitForFunction(() => /Open AI Chat/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));

  // AI Chat stops: two info stages gated on the guide bar's Continue button.
  await page.click('[data-view-target="aiChat"]');
  await page.waitForFunction(() => /On-device or ChatGPT/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.equal(await page.locator('[data-action="ai-chat-mode"][data-mode="local"]').count(), 1);
  assert.equal(await page.locator('[data-action="ai-chat-mode"][data-mode="remote"]').count(), 1);
  await page.click('[data-action="advance-guided-demo"]');
  await page.waitForFunction(() => /You control the context/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.equal(await page.locator('[data-action="ai-chat-context-inspector"]').count(), 1);
  await page.click('[data-action="advance-guided-demo"]');
  await page.waitForFunction(() => /Open the voice scribe/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Open the voice scribe/);
  await page.click('[data-view-target="scribePro"]');
  await page.waitForFunction(() => /Voice scribe, on-device/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Voice scribe, on-device/);
  // The tour must not start the engine: no model download, no microphone use.
  assert.equal(await page.locator("#btnRecord").count(), 1);
  await page.click('[data-action="advance-guided-demo"]');
  await page.waitForFunction(() => /Open the bedside cheat sheets/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Open the bedside cheat sheets/);
  await page.click('[data-view-target="cheatSheets"]');
  await page.waitForFunction(() => /Open the ACS cheat sheet/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  await page.click('[data-cheat-sheets-open="acute-coronary-syndrome"]');
  await page.waitForFunction(() => /Write after bedside review/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Write after bedside review/);

  await page.click('[data-view-target="review"]');
  await page.waitForSelector('[data-action="download-final-note"]');
  // The right side is a single editor now (no separate preview pane): verify
  // the final note through the same Download .txt action the student uses.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('[data-action="download-final-note"]')
  ]);
  assert.doesNotMatch(await readFile(await download.path(), "utf8"), /pressure or squeezing feeling/, "cheat-sheet bedside questions must not leak into the note");
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Review the complete assessment and plan/);
  assert.match(await page.locator("[data-draft-assessment]").innerText(), /high-risk NSTEMI/i);
  assert.equal(await page.locator(".plan-problem-card").count(), 3);
  assert.match(await page.locator('.plan-problem-card').first().locator('[data-problem-field="diagnosticPlan"]').innerText(), /Coronary angiography is planned today/i);
  await page.selectOption("#reviewDataCategory", "vitals");
  // Vitals render as compact chips in the redesigned review UI.
  assert.match(await page.locator(".review-data-list").innerText(), /Vital signs[\s\S]*saved/);
  await page.selectOption("#reviewDataCategory", "labs");
  await page.fill("#reviewDataSearch", "troponin");
  assert.match(await page.locator(".review-data-list").innerText(), /High-sensitivity troponin/i);
  await page.selectOption("#reviewDataCategory", "other_results");
  await page.fill("#reviewDataSearch", "ECG");
  assert.match(await page.locator(".review-data-list").innerText(), /ECG interpretation[\s\S]*ST-segment depressions/i);
  await page.fill("#reviewDataSearch", "");
  await page.selectOption("#reviewDataCategory", "all");
  await page.locator("[data-draft-assessment]").press("End");
  await page.locator("[data-draft-assessment]").pressSequentially(" X");
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Review the complete assessment and plan/, "typing must not advance the demo");
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /Open the prompt builder/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Open the prompt builder/);

  await page.click('[data-view-target="prompts"]');
  assert.equal(await page.locator("#promptTaskSelect").inputValue(), "presentation_quality_editor");
  // The final callout's arrow must track the Copy prompt button's center
  // after viewport clamping: horizontal arrows share the target's center Y,
  // vertical arrows share the target's center X.
  const arrowMiss = await page.evaluate(() => {
    const callout = document.querySelector("[data-demo-callout]");
    const target = document.querySelector('[data-action="copy-prompt"]');
    if (!callout || !target) return "missing callout or target";
    const t = target.getBoundingClientRect();
    const c = callout.getBoundingClientRect();
    const style = getComputedStyle(callout);
    const placement = callout.dataset.placement;
    if (placement === "top" || placement === "bottom") {
      const ax = c.left + parseFloat(style.getPropertyValue("--demo-arrow-x"));
      return Math.abs(ax - (t.left + t.width / 2));
    }
    const ay = c.top + parseFloat(style.getPropertyValue("--demo-arrow-y"));
    return Math.abs(ay - (t.top + t.height / 2));
  });
  assert.ok(typeof arrowMiss === "number" && arrowMiss < 6,
    `final callout arrow must point at the Copy prompt button (miss ${arrowMiss}px)`);
  assert.match(await page.locator("#presentationToEdit").inputValue(), /high-risk NSTEMI/i);
  assert.match(await page.locator("#presentationToEdit").inputValue(), /Physical Exam/);
  assert.match(await page.locator("#presentationEditorInputTitle").innerText(), /From Draft Note/);
  assert.equal(await page.locator('[data-action="open-open-evidence"]').count(), 2);
  await page.click('[data-action="copy-prompt"]');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /high-risk NSTEMI/i);
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Demo complete/);
  await page.click('[data-action="exit-guided-demo"]');
  await page.waitForFunction(() => !document.querySelector("[data-demo-guide]"));
  assert.equal(await page.locator("#vaultView").getAttribute("class"), "view active");
  assert.doesNotMatch(await page.locator("body").innerText(), /Demo patient · Synthetic NSTEMI case/);
  assert.deepEqual(consoleErrors, []);
} finally {
  await browser.close();
}

console.log("Guided demo browser regression tests passed");
