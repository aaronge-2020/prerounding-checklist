import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { createAppServer, openRealApp, navigateToView } from "./browser/app-harness.js";

const server = await createAppServer(),
  browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const external = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(server.baseUrl)) external.push(request.url());
  });
  await openRealApp(page, server.baseUrl);
  await page.evaluate(async () => {
    const { normalizePatient, createEmptyVaultState } = await import("/src/app/state/vault.js?v=20261015-encounter-review");
    const { saveEncryptedVault } = await import("/src/app/state/persistence.js?v=20261015-encounter-review");
    const capture = (id, text) => ({
      id,
      label: "Respiratory plan",
      sourceKind: "primary_note",
      deidentifiedText: text,
      updatedAt: "synthetic-v1"
    });
    const patient = normalizePatient({
      id: "patient-review",
      displayLabel: "Synthetic Room",
      contextSections: [
        capture(
          "baseline",
          "Repeat pulmonary testing. Review inhaler technique.\n" +
            "Synthetic historical chart context retained for exact source comparison.\n".repeat(1400)
        )
      ],
      admissionPrimaryTeamNote: {
        id: "structured-plan",
        noteType: "hp",
        sections: { plan: { deidentifiedText: "Arrange spirometry.\r\nCheck inhaler technique." } }
      },
      days: [
        {
          id: "visit",
          date: "2026-10-14",
          label: "Follow-up visit",
          sourceCaptures: [capture("report", "Pulmonary testing completed; report reviewed.")]
        },
        { id: "later", date: "2026-10-15", label: "Next encounter", sourceCaptures: [] }
      ]
    });
    await saveEncryptedVault(
      {
        ...createEmptyVaultState(),
        patients: [patient, normalizePatient({ id: "other", displayLabel: "Other synthetic room" })],
        activePatientId: patient.id
      },
      "encounter browser passphrase"
    );
  });
  await page.reload();
  await page.fill("#vaultPassphrase", "encounter browser passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.locator('[data-action="select-admission"]').waitFor();
  await page.click('[data-action="select-admission"]');
  const panel = page.locator("[data-encounter-review]");
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  assert.match(await panel.locator(":scope > summary").innerText(), /Visit checklist/);
  assert.match(await panel.innerText(), /does not insert text into your draft/);
  await page.click('[data-action="encounter-tab"][data-tab="sources"]');
  await page.selectOption("[data-encounter-source-id]", "capture:baseline");
  const text = page.locator("[data-encounter-source-text]");
  assert.ok((await text.inputValue()).length > 50000, "the source browser retains the complete long chart without an LLM context limit");
  await text.evaluate((node) => {
    node.focus();
    node.setSelectionRange(0, 25);
  });
  assert.equal(await page.locator('[data-action="encounter-add"][data-kind="follow_up"]').innerText(), "Check a prior plan");
  await page.click('[data-action="encounter-add"][data-kind="follow_up"]');
  await panel
    .locator(".encounter-item")
    .waitFor({ timeout: 5000 })
    .catch(async (error) => {
      console.log(await page.locator("#statusLine").innerText());
      console.log(await panel.innerText());
      throw error;
    });
  assert.match(await panel.innerText(), /Repeat pulmonary testing/);
  assert.equal(await panel.locator("[data-encounter-status]").inputValue(), "unknown");
  await panel.locator("[data-encounter-status]").selectOption("pending");
  await page.waitForFunction(() => /Answer saved/.test(document.querySelector(".encounter-feedback")?.textContent || ""));
  await page.click('[data-action="select-day"][data-day-id="visit"]');
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  assert.equal(await panel.locator("[data-encounter-status]").inputValue(), "unknown");
  assert.match(await panel.innerText(), /Previously pending/);
  await panel.locator(".encounter-item-details > summary").click();
  await page.click('[data-action="encounter-choose-evidence"]');
  await text.evaluate((node) => {
    node.focus();
    node.setSelectionRange(0, node.value.length);
  });
  await page.click('[data-action="encounter-attach"]');
  await page.locator("[data-encounter-status]").waitFor();
  await page.locator("[data-encounter-status]").selectOption("completed");
  await page.waitForFunction(() => /Answer saved/.test(document.querySelector(".encounter-feedback")?.textContent || ""));
  assert.equal(await panel.locator('[data-action="encounter-choose-evidence"]').textContent(), "Replace linked result or note");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.baseUrl });
  await page.click('[data-action="encounter-copy"]');
  const brief = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(brief, /Completed \(clinician-recorded\)/);
  assert.match(brief, /Pulmonary testing completed/);
  await page.selectOption("[data-encounter-filter]", "attention");
  assert.equal(await panel.locator(".encounter-item").count(), 0);
  await page.selectOption("[data-encounter-filter]", "all");
  await page.evaluate(() => {
    globalThis.__encounterOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "prerounding.local.encryptedVault.v1") throw new Error("Synthetic storage failure");
      return globalThis.__encounterOriginalSetItem.call(this, key, value);
    };
  });
  await page.locator("[data-encounter-status]").selectOption("pending");
  await page.waitForFunction(() => /Not saved/.test(document.querySelector(".encounter-feedback")?.textContent || ""));
  assert.equal(
    await page.locator("[data-encounter-status]").inputValue(),
    "completed",
    "failed encrypted writes roll back the review decision"
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = globalThis.__encounterOriginalSetItem;
    delete globalThis.__encounterOriginalSetItem;
  });
  await page.click('[data-action="encounter-tab"][data-tab="compare"]');
  await page.selectOption("[data-encounter-compare]", "admission");
  assert.match(await panel.innerText(), /Different text/);
  await panel.locator(".encounter-compare-row").filter({ hasText: "Respiratory plan" }).locator("summary").click();
  assert.match(await panel.innerText(), /Pulmonary testing completed/);
  assert.match(await panel.innerText(), /Repeat pulmonary testing/);
  await page.click('[data-action="encounter-tab"][data-tab="items"]');
  await mkdir("docs/encounter-review", { recursive: true });
  await panel.screenshot({ path: "docs/encounter-review/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action="select-day"][data-day-id="visit"]');
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  assert.equal(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true, "review fits mobile width");
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, "review must be inside the mobile viewport, not clipped by the day rail");
  await panel.screenshot({ path: "docs/encounter-review/mobile.png" });
  console.log("Mobile review bounds", await panel.boundingBox());
  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateToView(page, "vault");
  await page.click('[data-action="lock-vault"]');
  assert.equal(await page.locator("[data-encounter-review]").count(), 0);
  assert.ok(!(await page.locator("body").innerText()).includes("pulmonary testing"));
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("pulmonary testing"));
  await page.fill("#vaultPassphrase", "encounter browser passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.locator('[data-action="select-day"][data-day-id="visit"]').waitFor();
  await page.click('[data-action="select-day"][data-day-id="visit"]');
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  assert.equal(await panel.locator("[data-encounter-status]").inputValue(), "completed", "explicit status survives encrypted lock/unlock");
  await page.click('[data-action="select-day"][data-day-id="later"]');
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  assert.equal(await panel.locator("[data-encounter-status]").inputValue(), "unknown");
  await page.click('[data-action="encounter-tab"][data-tab="sources"]');
  await page.selectOption("[data-encounter-source-packet]", "admission");
  await page.selectOption("[data-encounter-source-id]", "note:structured-plan:plan");
  await panel.locator(".encounter-plan-passages > summary").click();
  await panel.locator('[data-action="encounter-track-line"]').last().click();
  await page.waitForFunction(() => document.querySelectorAll(".encounter-item").length === 2);
  assert.match(await panel.innerText(), /Check inhaler technique/);
  await navigateToView(page, "review");
  await page.click('[data-action="open-encounter-review"]');
  assert.equal(await panel.evaluate((node) => node.open), true, "note writer links back to the same packet's review workspace");
  await page.selectOption("#patientSwitcher", "other");
  assert.equal(await panel.locator(".encounter-item").count(), 0);
  assert.ok(
    !(await page.locator("body").innerText()).includes("Repeat pulmonary testing"),
    "switching patients clears the prior review DOM"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], "review workflow has no external network traffic");
  console.log(
    "Encounter browser: exact-source tracking, evidence, packet-specific statuses, comparisons, encrypted reload, locked boundary and mobile layout passed."
  );
} finally {
  await browser.close();
  await server.close();
}
