import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const cases = [];
for (const [folder, scope] of [["narrative-hps", "admission"], ["public-sample-notes", "admission"], ["narrative-progress-notes", "daily"], ["primary-team-notes", "daily"]]) {
  const directory = new URL(`./fixtures/${folder}/`, import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /\.(md|txt)$/.test(name) && name !== "README.md").sort()) {
    cases.push({ name: `${folder}/${name}`, scope, text: await readFile(new URL(name, directory), "utf8") });
  }
}
cases.push(
  { name: "unheaded narrative", scope: "daily", text: "Breathing improved overnight. No new symptoms. Continue monitoring oral intake and ambulation." },
  { name: "long Epic note", scope: "daily", text: `HPI\n${"Breathing improved with rest. No chest pain or dizziness. ".repeat(250)}\n\nPHYSICAL EXAM\nAlert, lungs clear.\n\nASSESSMENT\nDyspnea improving.\n\nPLAN\nMonitor symptoms.` },
  { name: "CRLF and Unicode", scope: "daily", text: "INTERVAL EVENTS\r\nO₂ reduced to 2 L/min — comfortable.\r\n\r\nPHYSICAL EXAM\r\nT 37.2 °C. BP 120/80.\r\n\r\nASSESSMENT\r\nImproving oxygen requirement.\r\n\r\nPLAN\r\nContinue observation." }
);
const server = await createAppServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const external = [];
page.on("request", (request) => { if (!request.url().startsWith(server.baseUrl) && /^https?:/.test(request.url())) external.push(request.url()); });
const fields = () => page.locator("[data-structured-note-field]").evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.dataset.structuredNoteField, node.value])));
const words = (text) => new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
let saved = 0;
try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  let activeScope = "admission";
  for (const [index, entry] of cases.entries()) {
    await page.setViewportSize({ width: [1440, 1280, 390][index % 3], height: 1000 });
    if (entry.scope !== activeScope) {
      await page.locator(".new-day-control > summary").click();
      await page.fill("#newDayLabel", "Corpus day");
      await page.click('[data-action="add-day"]');
      activeScope = "daily";
    }
    await page.click('[data-note-mode="paste"]');
    const clear = page.locator('[data-action="clear-structured-note-paste"]');
    if (await clear.isEnabled()) await clear.click();
    await page.locator("[data-structured-note-paste]").fill(entry.text);
    await page.click('[data-action="review-structured-note-sections"]');
    assert.equal(await page.locator("[data-note-original]").textContent(), entry.text.replace(/\r\n/g, "\n"), `${entry.name}: original retained`);
    const parsed = await fields();
    assert.equal(Object.keys(parsed).length, entry.scope === "admission" ? 21 : 16, "every section exists, including empty destinations");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${entry.name}: no page overflow`);
    const populated = Object.entries(parsed).filter(([, text]) => text.trim());
    assert.ok(populated.length, `${entry.name}: parsed or retained as other content`);
    // Markdown section labels become UI labels rather than body text.
    const sourceWords = words(entry.text.replace(/^#{1,6}\s.*$/gm, "").replace(/^[A-Z][A-Z /&-]+(?::\s*|$)/gm, ""));
    const labels = await page.locator("[data-structured-note-field]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")).join(" "));
    const resultWords = words(`${Object.values(parsed).join(" ")} ${labels}`);
    const coverage = [...sourceWords].filter((word) => resultWords.has(word)).length / sourceWords.size;
    assert.ok(coverage > 0.9, `${entry.name}: source-word retention ${coverage}`);
    const [fieldId, value] = populated.find(([id]) => ["physical_exam", "assessment", "history_of_present_illness", "interval_events"].includes(id)) || populated[0];
    const field = page.locator(`[data-structured-note-field="${fieldId}"]`);
    const revised = `${value}\nClinician reviewed this section.`;
    await field.fill(revised);
    await page.click('[data-note-mode="paste"]');
    await page.click('[data-action="review-structured-note-sections"]');
    assert.equal(await field.inputValue(), revised, `${entry.name}: manual edit retained`);
    for (const [id, text] of Object.entries(parsed)) if (id !== fieldId) assert.equal((await fields())[id], text, `${entry.name}: unaffected ${id}`);
    if (index % 10 === 0 || index === cases.length - 1) {
      // The Sections list is hidden at widths up to 900px by design; where
      // it is shown it is the navigation route, otherwise the fill below
      // scrolls the card into view inside the pane.
      const oneLinerIndex = page.locator('[data-note-index-field="one_liner"]');
      if (await oneLinerIndex.isVisible()) await oneLinerIndex.click();
      await page.getByRole("textbox", { name: "One-liner", exact: true }).fill("Adult admitted for evaluation.");
      await page.selectOption("#deidModeSelect", "structured");
      await page.evaluate(() => document.querySelector("#toastContainer")?.replaceChildren());
      await page.click('[data-action="save-structured-primary-note"]');
      // Batch A (audit F10): the save confirmation arrives by toast only,
      // not the status line, so the save sync watches the toast text.
      await page.waitForFunction(() => /Primary-team note saved/.test(document.querySelector(".toast")?.textContent || ""), null, { timeout: 30000 });
      assert.equal(await page.locator("[data-note-original]").count(), 0, "raw original cleared after saving");
      assert.ok(Object.values(await fields()).some((text) => text.includes("Clinician reviewed this section.")));
      assert.equal((await fields()).one_liner, "Adult admitted for evaluation.");
      saved += 1;
    }
    if ((index + 1) % 10 === 0) console.log(`Corpus: ${index + 1}/${cases.length} notes checked`);
  }
  // Reload verifies encrypted persistence, not just the current DOM.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="daily"]');
  await page.getByRole("button", { name: /Corpus day/ }).click();
  assert.ok(Object.values(await fields()).some((text) => text.includes("Clinician reviewed this section.")), "saved correction restored after reload");
  assert.equal((await fields()).one_liner, "Adult admitted for evaluation.", "manually entered one-liner persists across reload");
  assert.equal(await page.locator("[data-note-original]").count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("Clinician reviewed this section.")), false, "saved note is encrypted at rest");
  await page.click('[data-action="save-structured-note-to-draft"]');
  await page.locator("#reviewView").waitFor({ state: "visible" });
  assert.ok(await page.locator("#reviewContent").textContent(), "Save & write note opens the note workspace");
  await page.click('[data-view-target="vault"]');
  await page.click('[data-action="lock-vault"]');
  assert.equal(await page.locator("#dailyContent").innerHTML(), "", "lock clears protected import DOM");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], "note validation makes no external requests");
  console.log(`PASS: ${cases.length} varied notes parsed, reviewed and edited; ${saved} explicit Structured-mode saves; reload, encryption and lock verified`);
} finally {
  await browser.close();
  await server.close();
}
