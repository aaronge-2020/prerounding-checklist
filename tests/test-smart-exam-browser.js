// Regression test: the Physical Exam section is inline smart variables, not a
// separate structured picker section. Workflow under test (the user's exact
// requirement): pick an exam template at the template location, press Insert,
// then complete the smart-variable dropdowns embedded directly in the prose.
// Each variable supports multiple simultaneous findings where appropriate
// (e.g. HEENT palpation: tenderness + masses), normal options are mutually
// exclusive with abnormal ones, and selections compile into the Physical Exam
// note text that Copy for Epic picks up.
//
// Also covers the earlier user-path defect: opening a finding dropdown and
// selecting an option must not yank the review view's scroll position.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const baseUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Reveal like a user would, then click with a real trusted mouse event and
// no automation scrolling. Returns scroll positions before/after.
async function userClick(selector) {
  const point = await page.locator(selector).evaluate((el) => {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const before = await page.evaluate(() => document.querySelector("#reviewView")?.scrollTop || 0);
  await page.mouse.click(point.x, point.y);
  await settle();
  const after = await page.evaluate(() => document.querySelector("#reviewView")?.scrollTop || 0);
  return { before, after };
}

const pill = (system, v) => `[data-action="smart-var-open"][data-system="${system}"][data-var="${v}"]`;
const option = (system, v, opt) => `[data-smart-var-option][data-system="${system}"][data-var="${v}"][data-option="${opt}"]`;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "smart exam test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), { timeout: 30000 });
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForTimeout(2000);
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("[data-smart-exam]", { timeout: 30000 });

  // 1. Inline smart-exam UI exists; the old separate picker section is gone.
  assert.equal(await page.locator("[data-exam-findings]").count(), 0, "no separate findings-picker section");
  assert.equal(await page.locator(".smart-exam [data-smart-exam-select]").count(), 1, "template picker present");

  // 2. Insert HEENT at the template location: prose with inline pills appears.
  await page.selectOption("[data-smart-exam-select]", "heent");
  await userClick('[data-action="smart-exam-insert"]');
  await page.waitForSelector('[data-smart-system="heent"]', { timeout: 5000 });
  const prose = await page.locator('[data-smart-system="heent"] .se-prose').innerText();
  assert.ok(prose.startsWith("HEENT:"), `prose starts with HEENT: (got ${prose.slice(0, 40)})`);
  assert.ok(await page.locator(pill("heent", "palpation")).count(), "palpation pill rendered inline");

  // 3. Open the palpation pill: the dropdown opens inline in the prose.
  await userClick(pill("heent", "palpation"));
  await page.waitForSelector(".se-dropdown", { timeout: 5000 });

  // 4. Multi-select: tenderness AND masses simultaneously (the user's example).
  await userClick(option("heent", "palpation", "tender"));
  await userClick(option("heent", "palpation", "masses"));
  const pillText = await page.locator(pill("heent", "palpation")).innerText();
  assert.ok(pillText.includes("tender") && pillText.includes("masses"), `pill shows both findings (got "${pillText}")`);

  // 5. Scroll stability: with the view scrolled down, opening a dropdown and
  // selecting an option must not yank the scroll position (user-path defect).
  // Use whichever pill is actually visible at that scroll offset, and click
  // by coordinates with no reveal step, so the test measures the app's own
  // behavior rather than automation scrolling.
  await page.evaluate(() => {
    const view = document.querySelector("#reviewView");
    view.scrollTop = view.scrollHeight; // clamp to the real maximum
  });
  await settle();
  const visPill = await page.evaluate(() => {
    const vr = document.querySelector("#reviewView").getBoundingClientRect();
    const el = [...document.querySelectorAll(".se-pill")].find((p) => {
      if (p.dataset.system === "heent" && p.dataset.var === "palpation") return false; // already open from step 4
      const r = p.getBoundingClientRect();
      return r.top >= vr.top + 40 && r.bottom <= vr.bottom - 40;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, system: el.dataset.system, var: el.dataset.var };
  });
  assert.ok(visPill, "a pill must be visible while the view is scrolled down");
  const scrollOf = () => page.evaluate(() => document.querySelector("#reviewView")?.scrollTop || 0);
  const before1 = await scrollOf();
  assert.ok(before1 > 100, `view must be scrolled down before pill click (was ${before1})`);
  await page.mouse.click(visPill.x, visPill.y);
  await settle();
  await page.waitForSelector(".se-dropdown", { timeout: 5000 });
  const after1 = await scrollOf();
  assert.ok(Math.abs(after1 - before1) <= 2, `pill open moved scroll (before=${before1}, after=${after1})`);
  // Click an abnormal option inside the open dropdown, again with no reveal.
  const optPoint = await page.evaluate(() => {
    const dd = document.querySelector(".se-dropdown");
    if (!dd) return null;
    const vr = document.querySelector("#reviewView").getBoundingClientRect();
    const label = [...dd.querySelectorAll(".se-opt")].find((l) =>
      !l.classList.contains("is-normal") && !l.querySelector("input").checked &&
      (() => { const r = l.getBoundingClientRect(); return r.top >= vr.top && r.bottom <= vr.bottom; })());
    if (!label) return null;
    const r = label.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: label.textContent.trim() };
  });
  assert.ok(optPoint, "an unchecked abnormal option must be visible in the dropdown");
  const before2 = await scrollOf();
  await page.mouse.click(optPoint.x, optPoint.y);
  await settle();
  const after2 = await scrollOf();
  assert.ok(Math.abs(after2 - before2) <= 2, `option select moved scroll (before=${before2}, after=${after2})`);
  const visPillText = await page.locator(pill(visPill.system, visPill.var)).innerText();
  assert.ok(visPillText.includes(optPoint.text.replace(/^✓ /, "")),
    `pill shows the selected option (got "${visPillText}")`);

  // 6. "All normal" fills every inserted system in one click.
  await userClick('[data-action="smart-exam-all-normal"]');
  const palpAfterNormal = await page.locator(pill("heent", "palpation")).innerText();
  assert.ok(palpAfterNormal.includes("non-tender"), `all-normal fills normals (got "${palpAfterNormal}")`);
  const normalFindings = palpAfterNormal.replace(" ▾", "").split(", ");
  assert.ok(!normalFindings.includes("masses"), "all-normal clears abnormals");
  assert.ok(!normalFindings.includes("tender"), "all-normal clears abnormals");

  // 7. Checking an abnormal after normals clears the normals (never "non-tender, tender").
  await userClick(pill("heent", "palpation"));
  await userClick(option("heent", "palpation", "tender"));
  const palpAbnormal = await page.locator(pill("heent", "palpation")).innerText();
  assert.ok(palpAbnormal.includes("tender") && !palpAbnormal.includes("non-tender"),
    `abnormal replaces normals (got "${palpAbnormal}")`);

  // 8. Custom free-text entry via the inline custom input.
  await page.fill('[data-smart-var-custom][data-system="heent"][data-var="palpation"]', "preauricular fullness");
  await page.keyboard.press("Enter");
  await settle();
  const palpCustom = await page.locator(pill("heent", "palpation")).innerText();
  assert.ok(palpCustom.includes("preauricular fullness"), `custom entry on pill (got "${palpCustom}")`);

  // 9. Compiled prose reaches the copied note (Copy for Epic).
  await page.keyboard.press("Escape"); // close the open dropdown, as a user would
  await settle();
  assert.equal(await page.locator(".se-dropdown").count(), 0, "dropdown closed");
  await page.click('[data-action="copy-final-note"]');
  await page.waitForFunction(() => /Plain-text note copied/.test(document.querySelector("#statusLine")?.textContent || ""), { timeout: 10000 });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clipboard.includes("Physical Exam"), "copied note has Physical Exam section");
  assert.ok(clipboard.includes("HEENT:"), "copied note has compiled HEENT prose");
  assert.ok(clipboard.includes("tender") && clipboard.includes("preauricular fullness"),
    "copied note has the selected + custom findings");

  assert.deepEqual(consoleErrors, [], `no JS errors expected, got: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
  console.log("PASS: smart physical-exam inline workflow");
} finally {
  await browser.close();
}
