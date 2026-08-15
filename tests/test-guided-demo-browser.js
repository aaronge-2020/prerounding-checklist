import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
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

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  const response = await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response?.status(), 200);
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "guided demo test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="start-guided-demo"]');
  await page.click('[data-action="add-admission-source"]');
  await page.waitForSelector('.section-editor.is-expanded [data-action="keep-reviewed-redaction"]');

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
  assert.deepEqual(consoleErrors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("Guided demo browser regression tests passed");
