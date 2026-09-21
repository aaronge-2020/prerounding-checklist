import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = new Map([
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".css", "text/css"],
  [".md", "text/markdown"],
  [".json", "application/json"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"]
]);

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": mime.get(extname(file)) || "application/octet-stream" });
  createReadStream(file).pipe(response);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.removeListener("error", reject);
    resolve();
  });
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  const appUrl = `http://127.0.0.1:${server.address().port}/`;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(appUrl).origin });
  const response = await page.goto(appUrl);
  assert.equal(response?.status(), 200);
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('.primary-nav [data-view-target]').length === 8);
  assert.deepEqual(
    await page.locator('.primary-nav [data-view-target]').evaluateAll((buttons) => buttons.map((button) => button.dataset.viewTarget)),
    ["vault", "daily", "workups", "checklist", "review", "prompts", "quickDeid", "settings"],
    "the visible page order must collect history and exam findings before Draft Note"
  );
  assert.deepEqual(
    await page.locator('main .view').evaluateAll((views) => views.map((view) => view.id)),
    ["vaultView", "dailyView", "workupsView", "checklistView", "reviewView", "promptsView", "quickDeidView", "settingsView"],
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
  assert.equal(await page.locator('[data-action="add-daily-source"]').isVisible(), true, "Confirm rest must remain usable after individual accepts");

  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => /Check the day-one changes|Choose checklist questions/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  for (let step = 0; step < 30; step += 1) {
    if (/Choose checklist questions/.test(await page.locator("[data-demo-guide]").innerText())) break;
    const confirmRest = page.locator('.section-editor.is-expanded [data-action="confirm-all-section-redactions"]:visible').first();
    const continueReview = page.locator('.section-editor.is-expanded [data-action="continue-section-review"]:visible').first();
    if (await confirmRest.count()) await confirmRest.click();
    else if (await continueReview.count()) await continueReview.click();
    else throw new Error("The guided daily review did not offer a next visible action.");
    await page.waitForTimeout(50);
  }
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Choose checklist questions/);
  await page.click('[data-view-target="workups"]');
  await page.locator(`.workup-checkbox[value="nstemi-prerounds"]`).check();
  await page.locator('.workup-editor-header-actions [data-action="build-checklist"]').click();
  await page.locator('.checklist-answer[name="nstemi-prerounds:chest-pain-now"]').selectOption("No chest discomfort now");
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Write after bedside data collection/);

  await page.click('[data-view-target="review"]');
  await page.waitForSelector('[data-checklist-finding-kind="history"] li');
  assert.match(await page.locator('[data-checklist-finding-kind="history"]').innerText(), /No chest discomfort now/);
  assert.doesNotMatch(await page.locator("[data-final-note-preview]").innerText(), /Do you have chest pressure or pain now/);
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Write your clinical assessment/);
  await page.selectOption("#reviewDataCategory", "vitals");
  assert.match(await page.locator(".review-data-list").innerText(), /24-hour range[\s\S]*Mean[\s\S]*Median/);
  await page.selectOption("#reviewDataCategory", "labs");
  await page.fill("#reviewDataSearch", "troponin");
  assert.match(await page.locator(".review-data-list").innerText(), /High-sensitivity troponin/i);
  await page.selectOption("#reviewDataCategory", "other_results");
  await page.fill("#reviewDataSearch", "ECG");
  assert.match(await page.locator(".review-data-list").innerText(), /ECG interpretation[\s\S]*ST-segment depressions/i);
  await page.fill("#reviewDataSearch", "");
  await page.selectOption("#reviewDataCategory", "all");
  await page.fill("[data-draft-assessment]", "NSTEMI symptoms are improving while awaiting coronary angiography.");
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Save the encrypted draft/);
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /Open the prompt builder/.test(document.querySelector("[data-demo-guide]")?.textContent || ""));
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Open the prompt builder/);

  await page.click('[data-view-target="prompts"]');
  assert.equal(await page.locator("#promptTaskSelect").inputValue(), "presentation_quality_editor");
  assert.match(await page.locator("#presentationToEdit").inputValue(), /NSTEMI symptoms are improving/);
  assert.match(await page.locator("#presentationToEdit").inputValue(), /Physical Exam/);
  assert.match(await page.locator("#presentationEditorInputTitle").innerText(), /From Draft Note/);
  assert.equal(await page.locator('[data-action="open-open-evidence"]').count(), 2);
  await page.click('[data-action="copy-prompt"]');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /NSTEMI symptoms are improving/);
  assert.match(await page.locator("[data-demo-guide]").innerText(), /Demo complete/);
  await page.click('[data-action="exit-guided-demo"]');
  await page.waitForFunction(() => !document.querySelector("[data-demo-guide]"));
  assert.equal(await page.locator("#vaultView").getAttribute("class"), "view active");
  assert.doesNotMatch(await page.locator("body").innerText(), /Demo patient · Synthetic NSTEMI case/);
  assert.deepEqual(consoleErrors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("Guided demo browser regression tests passed");
