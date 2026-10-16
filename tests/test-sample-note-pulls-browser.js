import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient, navigateToView } from "./browser/app-harness.js";
import { installSyntheticDeid } from "./browser/external-ai-fixture.js";
import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";

const server = await createAppServer(),
  browser = await chromium.launch();
try {
  const page = await browser.newPage({ serviceWorkers: "block" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installSyntheticDeid(page);
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await navigateToView(page, "sampleNotes");
  await page.click('[data-action="sample-notes-add-all"]');
  await page.waitForFunction(() => /Sample import finished/.test(document.querySelector("#statusLine")?.textContent || ""), null, {
    timeout: 60000
  });
  const samples = await page.evaluate(async () => {
    const { loadOrCreateVault } = await import("/src/app/state/persistence.js?v=20261015-encounter-review");
    const vault = await loadOrCreateVault("clinical review test passphrase");
    return vault.patients
      .filter((patient) => patient.metadata.sampleImport)
      .map((patient) => ({
        id: patient.id,
        fixture: patient.metadata.sampleNoteId,
        body: patient.contextSections.find((source) => source.sourceKind === "primary_note").deidentifiedText
      }));
  });
  assert.equal(samples.length, 9, "the real Add all action imports every bundled test case");
  // Reproduce cases already opened by the broken reader: the original typed
  // source exists, but an empty draft was previously saved in the vault.
  await page.evaluate(async () => {
    const { loadOrCreateVault, saveEncryptedVault } = await import("/src/app/state/persistence.js?v=20261015-encounter-review");
    const { createNoteDraft } = await import("/src/note-drafts/index.js?v=20261012-citation-preview");
    const vault = await loadOrCreateVault("clinical review test passphrase");
    for (const patient of vault.patients.filter((entry) => entry.metadata.sampleImport))
      patient.noteDrafts = { admission: createNoteDraft("hp", { patientId: patient.id }) };
    await saveEncryptedVault(vault, "clinical review test passphrase");
  });
  await page.reload();
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.locator("#patientSwitcher").waitFor({ state: "visible" });
  await navigateToView(page, "vault");
  for (const sample of samples) {
    await page.selectOption("#patientSwitcher", sample.id);
    await navigateToView(page, "review");
    await page.selectOption("#reviewPacketSelect", "admission");
    const expected = parsePrimaryTeamNote(sample.body, "hp");
    assert.equal(
      (await page.locator('[data-draft-section="history_of_present_illness"]').innerText()).trim(),
      "",
      "existing user drafts are not overwritten by source discovery"
    );
    await page.evaluate(() => document.querySelector("#toastContainer")?.replaceChildren());
    await page.click('[data-pull-section="history_of_present_illness"]');
    const hpi = await page.locator('[data-draft-section="history_of_present_illness"]').innerText();
    assert.equal(
      hpi.trim(),
      expected.sections.history_of_present_illness.trim(),
      `${sample.fixture}: HPI pulls from the saved admission source`
    );
    assert.match(
      await page.locator("#toastContainer").innerText(),
      /Pulled history of present illness/,
      `${sample.fixture}: real pull action succeeds`
    );
    if (expected.sections.assessment.trim()) {
      await page.click('[data-pull-section="assessment"]');
      assert.equal(
        (await page.locator("[data-draft-assessment]").innerText()).trim(),
        expected.sections.assessment.trim(),
        `${sample.fixture}: assessment pulls`
      );
    }
    for (const field of ["past_medical_history"]) {
      if (!expected.sections[field]?.trim()) continue;
      await page.click(`[data-pull-section="${field}"]`);
      assert.equal(
        (await page.locator(`[data-draft-section="${field}"]`).innerText()).trim(),
        expected.sections[field].trim(),
        `${sample.fixture}: ${field} pulls`
      );
    }
  }
  await page.waitForFunction(async () => {
    const { loadOrCreateVault } = await import("/src/app/state/persistence.js?v=20261015-encounter-review");
    const vault = await loadOrCreateVault("clinical review test passphrase");
    return vault.patients
      .filter((entry) => entry.metadata.sampleImport)
      .every((entry) => entry.noteDrafts?.admission?.sections?.history_of_present_illness?.deidentifiedText?.trim());
  });
  await page.reload();
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.locator("#patientSwitcher").waitFor({ state: "visible" });
  await navigateToView(page, "review");
  assert.ok(
    (await page.locator('[data-draft-section="history_of_present_illness"]').innerText()).trim(),
    "pulled content survives encrypted reload"
  );
  assert.deepEqual(errors, []);
  console.log(`Sample note pulls: all ${samples.length} real imports expose HPI/history sections; encrypted reload passed.`);
} finally {
  await browser.close();
  await server.close();
}
