import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const SHOTS = "/tmp/u1-u17-shots";
const { mkdirSync } = await import("node:fs");
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--no-proxy-server"]
});
const consoleErrors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  await page.goto(fileAppUrl());
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "u1-u17 verification passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 30000 });
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForTimeout(2000);

  // ---- U7: duplicate review/draft navigation controls ----
  const navReview = await page.locator('[data-view-target="review"]').count();
  const navDraft = await page.locator('[data-view-target="draft"]').count();
  console.log("U7: [data-view-target=review] count =", navReview, "| [data-view-target=draft] count =", navDraft);
  const reviewLikeButtons = await page.evaluate(() => {
    const names = [];
    document.querySelectorAll("button, a").forEach((el) => {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (/review|draft note/i.test(text) && text.length < 60) names.push(`${el.tagName}:${text}`);
    });
    return names;
  });
  console.log("U7: review/draft-like controls:", JSON.stringify(reviewLikeButtons));

  // ---- Hospital stay view: U1/U2 vital cards, U17 detected sections ----
  await page.click('[data-view-target="daily"]');
  await page.waitForTimeout(1500);
  const vitalCards = await page.locator(".clinical-vital-stat").count();
  console.log("U1/U2: vital summary cards =", vitalCards);
  if (vitalCards > 1) {
    const heights = await page.locator(".clinical-vital-stat").evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)));
    console.log("U1: card heights =", JSON.stringify(heights));
    assert.ok(heights.every((h) => h === heights[0]), `U1: cards should have equal heights, got ${heights}`);
    console.log("PASS U1: vital cards have equal heights");
  }
  const redundantRanges = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll(".clinical-vital-summary, .clinical-trends").forEach((section) => {
      const text = section.textContent || "";
      const matches = text.match(/\b(\d+(?:\.\d+)?)\s*–\s*(\d+(?:\.\d+)?)/g) || [];
      matches.forEach((m) => {
        const [a, b] = m.split("–").map((s) => s.trim());
        if (a === b) hits.push(m);
      });
    });
    return hits;
  });
  console.log("U2: redundant equal ranges in vital summary =", JSON.stringify(redundantRanges));
  assert.equal(redundantRanges.length, 0, "U2: no x–x ranges should render");
  console.log("PASS U2: no redundant equal ranges in vital summary");

  // U17: detected sections — warn markers vs checks.
  const detectedItems = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll(".structured-note-detected-list li").forEach((li) => {
      items.push({ text: (li.textContent || "").trim().slice(0, 80), warn: li.querySelector(".detected-warning") !== null });
    });
    return items;
  });
  console.log("U17: detected-section items =", JSON.stringify(detectedItems));
  await page.screenshot({ path: `${SHOTS}/desktop-stay.png` });

  // ---- Review view: U3/U5/U6/U10/U11/U12-U16 ----
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewPacketSelect", { timeout: 30000 });
  await page.waitForTimeout(1000);

  const packetInfo = await page.evaluate(() => {
    const select = document.querySelector("#reviewPacketSelect");
    return {
      selected: select.value,
      options: [...select.options].map((o) => o.text),
      truncated: select.scrollWidth > select.clientWidth + 2
    };
  });
  console.log("U5/U6: packet select =", JSON.stringify(packetInfo));
  assert.ok(!packetInfo.truncated, "U6: packet label should not truncate");

  // U11: insert chip.
  const chip = await page.locator('[data-action="insert-no-acute-events"]').count();
  if (chip) {
    const chipClass = await page.locator('[data-action="insert-no-acute-events"]').getAttribute("class");
    const chipText = await page.locator('[data-action="insert-no-acute-events"]').innerText();
    console.log("U11: chip class =", chipClass, "| text =", JSON.stringify(chipText));
    assert.ok(chipClass.includes("ed-insert-chip"), "U11: should use the insert-chip style");
    assert.ok(/^insert/i.test(chipText.trim()), "U11: should read as an action");
    console.log("PASS U11: insert chip styled as action");
  } else {
    console.log("U11: insert chip not present on this note type (expected for non-progress notes)");
  }

  // U10: empty-plan hint.
  const emptyPlan = await page.evaluate(() => {
    const list = document.querySelector(".plan-problem-list");
    if (!list) return null;
    return {
      empty: /No problems added yet/.test(list.textContent || ""),
      hint: /may not have parsed/i.test(list.textContent || "")
    };
  });
  console.log("U10: plan state =", JSON.stringify(emptyPlan));

  // U3/U12-U16: download the .txt and inspect the copied note.
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.click('[data-action="download-final-note"]');
  const download = await downloadPromise;
  const downloadPath = `${SHOTS}/final-note.txt`;
  await download.saveAs(downloadPath);
  const { readFileSync } = await import("node:fs");
  const noteText = readFileSync(downloadPath, "utf8");
  console.log("U3/U12-U16: downloaded note length =", noteText.length);
  assert.ok(!/Diagnostic plan —/.test(noteText), "U3: no 'Diagnostic plan —' prefixes in copied note");
  assert.ok(!/Therapeutic plan —/.test(noteText), "U3: no 'Therapeutic plan —' prefixes in copied note");
  assert.ok(!/\d %/.test(noteText), "U16: no 'NN %' spacing in copied note");
  assert.ok(!/[<>=!]=?\s*—/.test(noteText), "U15: no em-dash comparison artifacts in copied note");
  console.log("PASS U3/U15/U16: copied note clean");
  console.log("NOTE TEXT SAMPLE:\n" + noteText.split("\n").slice(0, 40).join("\n"));

  await page.screenshot({ path: `${SHOTS}/desktop-review.png` });

  // ---- Mobile 390x844: U8 ----
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (error) => consoleErrors.push("mobile: " + String(error)));
  await mobile.goto(fileAppUrl());
  await mobile.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await mobile.fill("#vaultPassphrase", "u1-u17 verification passphrase");
  await mobile.click('[data-action="unlock-vault"]');
  await mobile.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 30000 });
  await mobile.click('[data-action="start-guided-demo"]');
  await mobile.waitForTimeout(2000);
  const navOverflow = await mobile.evaluate(() => {
    const nav = document.querySelector(".primary-nav");
    if (!nav) return null;
    return { scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth, scrollable: nav.scrollWidth > nav.clientWidth + 1 };
  });
  console.log("U8: mobile nav =", JSON.stringify(navOverflow));
  await mobile.screenshot({ path: `${SHOTS}/mobile-nav.png` });
  await mobile.click('[data-view-target="review"]');
  await mobile.waitForSelector("#reviewPacketSelect", { timeout: 30000 });
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: `${SHOTS}/mobile-review.png` });
  const mobileTruncated = await mobile.evaluate(() => {
    const select = document.querySelector("#reviewPacketSelect");
    return select ? select.scrollWidth > select.clientWidth + 2 : null;
  });
  console.log("U6 mobile: packet select truncated =", mobileTruncated);
  await mobile.close();

  console.log("\n=== BROWSER VERIFICATION DONE ===");
  console.log("JS errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
  await browser.close();
}
