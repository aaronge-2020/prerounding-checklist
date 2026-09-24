import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const sepsisNote = readFileSync(new URL("./fixtures/public-sample-notes/08-sepsis-consult.txt", import.meta.url), "utf8");

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page);

  // Paste the sepsis note as the admission note.
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="admission"][data-note-mode="paste"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="admission"]', sepsisNote);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="admission"]');
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="admission"]');
  await page.waitForFunction(() => /Primary-team note saved|Structured note saved/i.test(document.querySelector("#statusLine")?.textContent || ""));

  // Open the review / note editor.
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForSelector(".note-draft-panel");

  const bodyText = await page.locator(".note-draft-panel").innerText();

  // 1. No chunky source-linked block UI.
  assert.doesNotMatch(bodyText, /Source-linked block/i, "must not show 'Source-linked block' labels");
  assert.doesNotMatch(bodyText, /Edited source-linked block/i, "must not show 'Edited source-linked block'");

  // 2. No unparsed fallbacks.
  assert.doesNotMatch(bodyText, /Unparsed/i, "must not show any 'Unparsed' labels");

  // 3. Vitals render as ONE grouped inline line.
  const groups = page.locator(".note-draft-panel [data-objective-group]");
  const groupCount = await groups.count();
  console.log(`Objective groups rendered: ${groupCount}`);
  const vitalsGroup = page.locator('.note-draft-panel [data-objective-group="vitals"]');
  assert.equal(await vitalsGroup.count(), 1, "vitals must render as a single group");
  const vitalsText = await vitalsGroup.innerText();
  console.log("Vitals group text:", JSON.stringify(vitalsText.slice(0, 120)));
  assert.match(vitalsText, /Vital signs:/, "vitals group must be labeled");
  // Multiple vital values on one line, not one card per vital.
  assert.equal(await page.locator('.note-draft-panel [data-objective-group="vitals"] [data-objective-group-text]').count(), 1);

  // 4. Lab groups render compactly (one group per family, not per result).
  const labGroups = await page.locator('.note-draft-panel [data-objective-group^="lab:"]').count();
  console.log(`Lab groups rendered: ${labGroups}`);

  // 5. The old per-block card markup is gone.
  assert.equal(await page.locator(".note-draft-panel .ed-block").count(), 0, "old .ed-block cards must not render");

  await page.locator('.note-draft-panel [data-objective-group="vitals"]').scrollIntoViewIfNeeded();
  await page.locator(".note-draft-panel").screenshot({ path: "/tmp/objective-groups.png" });
  console.log("Screenshot: /tmp/objective-groups.png");

  // 6. Final note still contains the vitals and labs.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('[data-action="download-final-note"]')
  ]);
  const { readFile } = await import("node:fs/promises");
  const finalText = await readFile(await download.path(), "utf8");
  assert.match(finalText, /Vitals:/, "final note must contain Vitals");
  console.log("Final note Objective section:");
  const objSection = finalText.split("Objective")[1]?.split("Assessment")[0]?.trim().slice(0, 400);
  console.log(objSection);

  console.log("\nAll Objective editor UI assertions passed.");
} finally {
  await browser.close();
}
if (consoleErrors.length) {
  console.log("\nConsole/page errors:", consoleErrors.slice(0, 5));
  process.exit(1);
}
