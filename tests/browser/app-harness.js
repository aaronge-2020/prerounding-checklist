import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const mime = new Map([
  [".html", "text/html"], [".js", "text/javascript"], [".mjs", "text/javascript"],
  [".css", "text/css"], [".md", "text/markdown"], [".json", "application/json"],
  [".ico", "image/x-icon"], [".wasm", "application/wasm"]
]);

export async function createAppServer() {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(root, relative));
    requests.push({ path: url.pathname, file });
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { "content-type": "text/plain" });
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
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

export async function openRealApp(page, baseUrl) {
  if (baseUrl.startsWith("file://")) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    assert.equal(page.url(), baseUrl);
  } else {
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    assert.ok(response, "the app navigation must return an HTTP response");
    assert.equal(response.status(), 200, `expected the real app HTML at ${page.url()}`);
    assert.match(response.headers()["content-type"] || "", /text\/html/);
    assert.equal(page.url(), baseUrl);
  }
  await page.waitForSelector("#vaultPassphrase");
  assert.equal(await page.title(), "Preround");
}

export function fileAppUrl() {
  return `file://${join(root, "index.html")}`;
}

export async function unlockAndCreatePatient(page, { passphrase = "clinical review test passphrase", label = "Synthetic Room" } = {}) {
  await page.fill("#vaultPassphrase", passphrase);
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  if (await page.locator("#newPatientLabel").count()) {
    await page.fill("#newPatientLabel", label);
    await page.click('[data-action="admit-patient"]');
  }
  await page.waitForSelector("#dailyContent .source-first-stay");
  await page.selectOption("#deidModeSelect", "structured");
  if (await page.locator("#dailyAdmissionDateInput").count()) await page.fill("#dailyAdmissionDateInput", "2026-09-18");
}
