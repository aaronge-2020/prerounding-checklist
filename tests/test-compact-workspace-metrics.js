import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";
const server = await createAppServer(),
  browser = await chromium.launch();
const phase = process.env.UX_PHASE || "after",
  width = Number(process.env.UX_WIDTH) || 1440,
  height = width === 1440 ? 900 : 800;
const page = await browser.newPage({ viewport: { width, height } });
const results = [];
async function reset() {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) if (el.scrollTop) el.scrollTop = 0;
  });
  // Park the pointer over the middle of the top bar, not at (0, 0):
  // (0, 0) sits on the app rail, and since the rail expands on hover
  // into a floating overlay, a parked pointer leaves it expanded over
  // the workspace's left edge, where it swallows the next measure's
  // first click (the writer outline jump landed on the nav and
  // navigated away). The top bar's middle has no hover behavior.
  await page.mouse.move(Math.round(width / 2), 10);
  await page.waitForTimeout(80);
}
let moves = 0,
  clicks = 0,
  wheels = 0,
  wheelDelta = 0,
  travel = 0,
  last = { x: 0, y: 0 };
async function move(x, y) {
  if (x !== last.x || y !== last.y) {
    moves++;
    travel += Math.hypot(x - last.x, y - last.y);
    await page.mouse.move(x, y);
    last = { x, y };
  }
}
async function reach(locator) {
  for (let i = 0; i < 100; i++) {
    const p = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        x = r.x + Math.min(r.width / 2, 100),
        y = r.y + r.height / 2;
      let owner = null,
        clip = { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight) {
          const q = a.getBoundingClientRect();
          clip = {
            top: Math.max(clip.top, q.top + (a.matches(".note-arrange-sections") && !el.closest(".note-sheet-heading") ? 48 : 8)),
            bottom: Math.min(clip.bottom, q.bottom - 12),
            left: Math.max(clip.left, q.left),
            right: Math.min(clip.right, q.right)
          };
          if (!owner && (y < clip.top || y > clip.bottom)) owner = a;
        }
      }
      if (!owner && y >= clip.top && y <= clip.bottom) return { x, y, ready: true };
      if (!owner) owner = document.querySelector(".view.active");
      const q = owner.getBoundingClientRect();
      return {
        x: Math.max(20, Math.min(innerWidth - 20, q.right - 25)),
        y: Math.max(80, Math.min(innerHeight - 50, q.top + q.height / 2)),
        delta: Math.sign(y - (clip.top + clip.bottom) / 2) * Math.min(600, Math.abs(y - (clip.top + clip.bottom) / 2))
      };
    });
    if (p.ready) {
      await move(p.x, p.y);
      return;
    }
    await move(p.x, p.y);
    await page.mouse.wheel(0, p.delta);
    wheels++;
    wheelDelta += Math.abs(p.delta);
    await page.waitForTimeout(80);
  }
  throw Error("Could not reach " + (await locator.getAttribute("data-differential-field")));
}
async function click(locator) {
  await reach(locator);
  await page.mouse.click(last.x, last.y);
  clicks++;
}
async function edit(locator, text) {
  await click(locator);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  assert.equal(await locator.evaluate((el) => (el.isContentEditable ? el.innerText : el.value)), text);
}
async function measure(name, fn, resetScroll = true) {
  if (resetScroll) await reset();
  // Same parking rule as reset(): never (0, 0), which leaves the
  // hover-expanded app rail covering the workspace's left edge.
  else await page.mouse.move(Math.round(width / 2), 10);
  moves = clicks = wheels = wheelDelta = travel = 0;
  last = { x: 0, y: 0 };
  const started = performance.now();
  await fn();
  results.push({
    automatedElapsedMs: Math.round(performance.now() - started),
    task: name,
    clicks,
    pointerMoves: moves,
    pointerTravelPx: Math.round(travel),
    wheelGestures: wheels,
    wheelDeltaPx: Math.round(wheelDelta)
  });
  console.log(name + ": " + JSON.stringify(results.at(-1)));
}
async function jump(section, problem) {
  const selector = problem ? `[data-writer-problem="${problem}"]` : `[data-writer-section="${section}"]`;
  if (await page.locator(selector).count()) await click(page.locator(selector));
}
try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.locator('[data-note-mode="sections"]').click();
  await page.locator('[data-structured-note-field="one_liner"]').fill("Synthetic adult admitted for evaluation.");
  await page.locator('[data-action="save-structured-note-to-draft"]').click();
  await page.locator("#reviewView.active").waitFor();
  for (let p = 0; p < 6; p++) {
    await page.locator('[data-action="add-plan-problem"]').click();
    const card = page.locator(".plan-problem-card").nth(p);
    await card.locator('[data-problem-field="problem"]').fill(`Problem ${p + 1}`);
    await card.locator('[data-problem-field="keyContext"]').fill("Synthetic clinical context for testing.");
    for (let d = 0; d < 4; d++) {
      await card.locator('[data-action="add-differential"]').click();
      const row = card.locator(".differential-card[data-differential-id]").nth(d);
      await row.locator('[data-differential-field="diagnosis"]').fill(`Candidate ${d + 1}`);
      await row.locator('[data-differential-field="cluesFor"]').fill("Supporting finding under review.");
      await row.locator('[data-differential-field="cluesAgainst"]').fill("Alternative findings are absent.");
    }
  }
  const lastCard = page.locator(".plan-problem-card").nth(5),
    id = await lastCard.getAttribute("data-problem-id");
  const rowHeights = await page
    .locator(".differential-card[data-differential-id]")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const editorHeight = await page.locator("#noteEditor").evaluate((el) => el.scrollHeight);
  await measure("Edit fourth differential in sixth problem", async () => {
    await jump("", id);
    await edit(lastCard.locator('[data-differential-field="cluesAgainst"]').nth(3), "Updated counter-evidence.");
  });
  await page.screenshot({ path: `docs/compact-workspace/${phase}-${width}-writer.png` });
  await measure("Edit disposition at end of note", async () => {
    await jump("disposition");
    await edit(page.locator('[data-draft-closing="disposition"]'), "Disposition reviewed.");
  });
  await measure(
    "Return to one-liner and edit",
    async () => {
      await jump("one-liner");
      await edit(page.locator('[data-draft-section="one_liner"]'), "Updated synthetic summary.");
    },
    false
  );
  await measure("Open final preview", async () => {
    await click(page.locator('[role="tab"][data-workspace-tab="preview"]'));
  });
  await page.locator('[data-view-target="daily"]').click();
  await page.locator('[data-note-mode="paste"]').click();
  await page.locator("[data-structured-note-paste]").fill(await readFile("tests/fixtures/narrative-hps/hp-01.md", "utf8"));
  await page.locator('[data-action="review-structured-note-sections"]').click();
  await measure("Reach and edit Other note content in Epic import", async () => {
    const nav = page.locator('[data-note-index-field="other"]');
    if (await nav.isVisible()) await click(nav);
    else await page.locator('[data-note-drop-field="other"]').scrollIntoViewIfNeeded();
    await edit(page.locator('[data-structured-note-field="other"]'), "Additional copied source context.");
  });
  await page.screenshot({ path: `docs/compact-workspace/${phase}-${width}-import.png` });
  const result = {
    phase,
    viewport: { width, height },
    fixture: { problems: 6, differentialsPerProblem: 4 },
    differentialHeightPx: rowHeights[0],
    editorScrollHeightPx: editorHeight,
    results
  };
  await writeFile(`docs/compact-workspace/${phase}-${width}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
}
