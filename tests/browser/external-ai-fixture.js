// Deterministic synthetic detector for UI boundary tests. This is not a
// clinical de-identification evaluation and is never shipped with the app.
export async function installSyntheticDeid(page) {
  await page.route("**/src/patient-context/deid-client.js*", async route => {
    if (route.request().url().includes("privacy-fixture-real")) return route.continue();
    await route.fulfill({ contentType: "text/javascript", body: `
      import * as real from "./deid-client.js?privacy-fixture-real=1";
      export * from "./deid-client.js?privacy-fixture-real=1";
      export function getSelectedDeidModelStatus() { return {ready:true, modelId:"synthetic-model", modelKey:"stanford-clinical"}; }
      export async function verifyAdvancedDeidModel() { return getSelectedDeidModelStatus(); }
      export async function deidentifyText(text, options = {}) {
        if (options.mode === "structured") return real.deidentifyText(text, options);
        if (globalThis.__privacyScanFails) throw new Error("Synthetic scan failure");
        if (typeof globalThis.__privacyScanResult === "function") return globalThis.__privacyScanResult(String(text));
        return {text: String(text).replaceAll("Synthetic Person", "[NAME]"), modelId:"synthetic-model", entities:[], counts:{}, residualWarnings:[]};
      }
    ` });
  });
}

export async function approveFinalRequest(page) {
  await page.locator("[data-external-ai-review]").waitFor();
  await page.locator("[data-external-scan]:enabled").waitFor();
  if (!(await page.locator("[data-external-review-status]").textContent()).startsWith("Scan complete.")) await page.locator("[data-external-scan]").click();
  await page.waitForFunction(() => document.querySelector("[data-external-review-status]")?.textContent.startsWith("Scan complete."));
  await page.locator("[data-external-reviewed]").check();
  await page.locator("[data-external-permitted]").check();
  if (await page.locator("[data-external-search-reviewed]").count()) await page.locator("[data-external-search-reviewed]").check();
  await page.locator("[data-external-send]").click();
}
