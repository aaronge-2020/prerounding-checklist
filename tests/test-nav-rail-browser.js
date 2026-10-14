import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Batch A3, Items 1-2: the pin (chevron) toggle is gone, and the slim
// app-nav rail expands on hover with a smooth width animation while
// the workspace never moves. The defect behind the animation contract:
// hover expansion used to make the group labels appear and shove every
// nav button down mid-click, so the first click on a rail destination
// (e.g. Guided demo) landed on a moved target and did nothing. Nav
// button boxes must therefore be identical in the collapsed and
// hover-expanded states, including during the animation, and a click
// aimed at a button's resting position right after the pointer enters
// the rail must still start what the button labels.
const server = await createAppServer();
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const shotDir = process.env.NAV_RAIL_SHOT_DIR;
async function screenshot(page, name) {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}
const NAV_BUTTONS = '.primary-nav [data-view-target], .primary-nav [data-action="start-guided-demo"]';
async function buttonBoxes(page) {
  return page.evaluate((selector) => {
    const boxes = {};
    document.querySelectorAll(selector).forEach((button) => {
      const rect = button.getBoundingClientRect();
      boxes[button.dataset.viewTarget || button.dataset.action] = {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height
      };
    });
    return boxes;
  }, NAV_BUTTONS);
}
async function frameBoxes(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".side-nav").getBoundingClientRect();
    const main = document.querySelector(".app-main").getBoundingClientRect();
    return { nav: { x: nav.x, y: nav.y, width: nav.width, height: nav.height }, main: { x: main.x, y: main.y, width: main.width, height: main.height } };
  });
}
function assertSamePosition(before, after, label) {
  for (const key of Object.keys(before)) {
    assert.ok(after[key], `${label}: ${key} must still exist`);
    assert.ok(Math.abs(after[key].x - before[key].x) < 1, `${label}: ${key} x must not move (${before[key].x} -> ${after[key].x})`);
    assert.ok(Math.abs(after[key].y - before[key].y) < 1, `${label}: ${key} y must not move (${before[key].y} -> ${after[key].y})`);
    assert.ok(Math.abs(after[key].height - before[key].height) < 1, `${label}: ${key} height must not change (${before[key].height} -> ${after[key].height})`);
  }
}
// Record rail width, workspace box, and one button's y on every frame
// for `ms`, starting before the pointer moves.
async function sampleRail(page, ms) {
  await page.evaluate((duration) => {
    window.__railSamples = [];
    const nav = document.querySelector(".side-nav");
    const main = document.querySelector(".app-main");
    const button = document.querySelector('[data-action="start-guided-demo"]');
    const start = performance.now();
    const tick = () => {
      const navRect = nav.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      window.__railSamples.push({
        width: navRect.width, mainX: mainRect.x, mainWidth: mainRect.width,
        buttonY: buttonRect.y, buttonHeight: buttonRect.height
      });
      if (performance.now() - start < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);

  // Item 2: no pin toggle anywhere, in any view.
  for (const view of ["vault", "daily", "review"]) {
    await page.click(`[data-view-target="${view}"]`);
    await page.waitForSelector(`#${view}View.active`);
    assert.equal(await page.locator('[data-action="toggle-app-nav"]').count(), 0, `no nav toggle button in the ${view} view`);
    assert.equal(await page.locator(".app-nav-toggle").count(), 0, `no nav toggle element in the ${view} view`);
  }
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector("#dailyView.active");
  await page.mouse.move(700, 450);
  await page.waitForTimeout(300);

  // Resting state: slim rail, workspace beside it.
  const restFrame = await frameBoxes(page);
  assert.equal(restFrame.nav.width, 56, "the rail rests at 56px");
  const restButtons = await buttonBoxes(page);
  assert.ok(Object.keys(restButtons).length >= 14, "all rail destinations are present");
  const restLabels = await page.evaluate(() => [...document.querySelectorAll(".primary-nav .nav-group-label")].map((label) => ({
    opacity: Number(getComputedStyle(label).opacity),
    height: label.getBoundingClientRect().height
  })));
  for (const label of restLabels) {
    assert.equal(label.opacity, 0, "group labels are invisible at rest");
    assert.ok(label.height > 0, "group labels reserve their space at rest, so buttons cannot shift when they fade in");
  }
  await screenshot(page, "rail-rest-1440");

  // Item 1: hover animates the width; nothing else moves, ever.
  await sampleRail(page, 900);
  await page.mouse.move(28, 300);
  await page.waitForTimeout(1000);
  const openSamples = await page.evaluate(() => window.__railSamples);
  assert.ok(openSamples.length > 5, "the sampler must capture the animation");
  assert.ok(
    openSamples.some((sample) => sample.width > 57 && sample.width < 177),
    `hover expansion must animate through intermediate widths, saw: ${[...new Set(openSamples.map((s) => Math.round(s.width)))].join(",")}`
  );
  assert.equal(Math.round(openSamples.at(-1).width), 178, "hover expansion settles at 178px");
  for (const sample of openSamples) {
    assert.equal(sample.mainX, restFrame.main.x, "the workspace must not move during the animation");
    assert.equal(sample.mainWidth, restFrame.main.width, "the workspace must not resize during the animation");
    assert.ok(Math.abs(sample.buttonY - restButtons["start-guided-demo"].y) < 1, "nav buttons must not move during the animation");
    assert.ok(Math.abs(sample.buttonHeight - restButtons["start-guided-demo"].height) < 1, "nav buttons must not change height during the animation");
  }
  const openFrame = await frameBoxes(page);
  assert.equal(openFrame.nav.width, 178, "the expanded rail is 178px");
  assert.deepEqual(openFrame.main, restFrame.main, "the workspace box is identical with the rail open");
  assertSamePosition(restButtons, await buttonBoxes(page), "hover-expanded rail");
  // Every group label (including the first group's, which older rules
  // hide) occupies its space at rest and is fully visible when open.
  const labelStates = await page.evaluate(() => [...document.querySelectorAll(".primary-nav .nav-group-label")].map((label) => ({
    text: label.textContent.trim(),
    opacity: Number(getComputedStyle(label).opacity),
    height: label.getBoundingClientRect().height
  })));
  assert.deepEqual(labelStates.map((label) => label.text), ["Patient", "AI", "Tools", "App"], "all four group labels are present");
  for (const label of labelStates) {
    assert.equal(label.opacity, 1, `the ${label.text} group label is fully visible with the rail open`);
    assert.ok(label.height > 0, `the ${label.text} group label has height with the rail open`);
  }
  // The expanded rail shows its labels.
  assert.match(await page.locator('[data-action="start-guided-demo"]').innerText(), /Guided demo/);
  await screenshot(page, "rail-open-1440");

  // Pointer away: the rail animates shut and settles at 56px.
  await sampleRail(page, 900);
  await page.mouse.move(700, 450);
  await page.waitForTimeout(1000);
  const closeSamples = await page.evaluate(() => window.__railSamples);
  assert.ok(
    closeSamples.some((sample) => sample.width > 57 && sample.width < 177),
    "closing must animate through intermediate widths too"
  );
  assert.equal(Math.round(closeSamples.at(-1).width), 56, "the rail settles back at 56px");
  assertSamePosition(restButtons, await buttonBoxes(page), "rail after closing");

  // First click: aim at the Guided demo button's resting position the
  // moment the pointer enters the rail; the demo must start.
  const demoRest = restButtons["start-guided-demo"];
  await page.mouse.move(28, 120);
  await page.mouse.click(demoRest.x + demoRest.width / 2, demoRest.y + demoRest.height / 2);
  await page.waitForSelector("[data-demo-guide]", { timeout: 10000 });
  await page.click('[data-action="exit-guided-demo"]');
  await page.waitForFunction(() => !document.querySelector("[data-demo-guide]"));

  // Narrow width: same contract (rail on the left, hover floats it open).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(300, 400);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-action="toggle-app-nav"]').count(), 0, "no nav toggle at 390px");
  const narrowRest = await frameBoxes(page);
  assert.equal(narrowRest.nav.width, 56, "the rail rests at 56px at 390px wide");
  assert.equal(narrowRest.nav.x, 0, "the rail stays on the left at 390px wide");
  await screenshot(page, "rail-rest-390");
  await page.mouse.move(28, 300);
  await page.waitForFunction(() => Math.round(document.querySelector(".side-nav").getBoundingClientRect().width) === 178, null, { timeout: 5000 });
  const narrowOpen = await frameBoxes(page);
  assert.deepEqual(narrowOpen.main, narrowRest.main, "the workspace box is identical with the rail open at 390px");
  await screenshot(page, "rail-open-390");
  await page.mouse.move(300, 400);
  await page.waitForTimeout(500);
  assert.deepEqual(errors, [], "no page errors");
  await page.close();

  // Reduced motion: the transition is disabled; the rail still opens.
  const reduced = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await openRealApp(reducedPage, server.baseUrl);
  await unlockAndCreatePatient(reducedPage);
  await reducedPage.click('[data-view-target="daily"]');
  await reducedPage.waitForSelector("#dailyView.active");
  await reducedPage.mouse.move(700, 450);
  await reducedPage.waitForTimeout(200);
  const durations = await reducedPage.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".side-nav"));
    return { transitionDuration: style.transitionDuration, width: document.querySelector(".side-nav").getBoundingClientRect().width };
  });
  assert.equal(durations.width, 56, "the rail rests at 56px under reduced motion");
  assert.ok(
    durations.transitionDuration.split(",").every((part) => part.trim() === "0s"),
    `the rail width transition must be disabled under reduced motion, got: ${durations.transitionDuration}`
  );
  await reducedPage.mouse.move(28, 300);
  await reducedPage.waitForTimeout(250);
  assert.equal(
    await reducedPage.evaluate(() => Math.round(document.querySelector(".side-nav").getBoundingClientRect().width)),
    178,
    "the rail still opens under reduced motion, just without animating"
  );
  await reduced.close();

  console.log("PASS: pin toggle removed; rail hover animation moves nothing else; first click on a rail destination lands; reduced motion disables the transition");
} finally {
  await browser.close();
  await server.close();
}
