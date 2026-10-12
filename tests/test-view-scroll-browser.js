import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, navigateToView, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const server = await createAppServer();
const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("prerounding.mobileChoice.v1", "full"));
    await openRealApp(page, server.baseUrl);
    await unlockAndCreatePatient(page);
    await navigateToView(page, "settings");
    await page.locator("#localAiGuidelinesInput").fill("Synthetic guideline\n".repeat(100));
    await page.locator("#localAiGuidelinesInput").evaluate(el => { el.scrollTop = 200; });

    async function clickStable(selector, label) {
      const target = page.locator(selector);
      await target.scrollIntoViewIfNeeded();
      const before = await page.evaluate(async () => {
        const { captureScrollPositions } = await import("/src/ui/view-scroll.js?v=20261012-scroll-review");
        window.scrollTestPositions = captureScrollPositions(document.querySelector(".view.active"));
        return window.scrollTestPositions.map(entry => entry.top);
      });
      assert.ok(before.some(top => top > 100), `${label}: actually scrolled down`);
      const point = await target.boundingBox();
      await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => {
        const root = document.querySelector(".view.active");
        return window.scrollTestPositions.map(({ owner, selector }) => {
          const el = owner || (selector === ":scope" ? root : root.querySelector(selector));
          return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
        });
      });
      after.forEach((value, i) => assert.ok(Math.abs(value.top - Math.min(before[i], value.max)) <= 2,
        `${viewport.width} ${label}: ${before[i]} -> ${value.top}`));
    }
    await clickStable('[data-action="save-local-ai-guidelines"]', "save guidelines");
    assert.equal(await page.locator("#localAiGuidelinesInput").evaluate(el => el.scrollTop), 200);
    await page.locator("#apDefaultInstructions").fill("Synthetic A&P instructions\n".repeat(80));
    await page.locator("#apDefaultInstructions").evaluate(el => { el.scrollTop = 150; });
    await clickStable('[data-action="save-ap-default"]', "save A&P instructions");
    assert.equal(await page.locator("#apDefaultInstructions").evaluate(el => el.scrollTop), 150);
    await navigateToView(page, "prompts");
    await page.locator("#promptPreview").fill("Synthetic prompt instructions\n".repeat(100));
    await page.locator("#promptPreview").evaluate(el => { el.scrollTop = 300; });
    await clickStable('[data-action="save-prompt-template"]', "save prompt template");

    // Browser-level shared primitive: two similar panes must not cross-restore;
    // replaced IDs, details, focus and selection survive within the same root.
    const result = await page.evaluate(async () => {
      const { replaceViewContent } = await import("/src/ui/view-scroll.js?v=20261012-scroll-review");
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;inset:20px;background:white;z-index:9999;overflow:auto";
      document.body.append(host);
      const markup = `<section id="firstPane"><details open><summary>Exact content</summary><div data-scroll-key="text" style="height:100px;overflow:auto"><div style="height:900px">Synthetic text</div></div></details></section><section id="secondPane"><div data-scroll-key="text" style="height:100px;overflow:auto"><div style="height:900px">Other text</div></div></section><input id="cursorTest" value="abcdef">`;
      replaceViewContent(host, markup);
      host.querySelector("#firstPane [data-scroll-key]").scrollTop = 350;
      host.querySelector("#secondPane [data-scroll-key]").scrollTop = 170;
      const input = host.querySelector("input");
      input.focus({ preventScroll: true }); input.setSelectionRange(2, 4);
      replaceViewContent(host, markup.replace("details open", "details"));
      const values = [host.querySelector("#firstPane [data-scroll-key]").scrollTop,
        host.querySelector("#secondPane [data-scroll-key]").scrollTop,
        host.querySelector("details").open, document.activeElement.id,
        host.querySelector("input").selectionStart, host.querySelector("input").selectionEnd];
      host.querySelector("#firstPane [data-scroll-key]").scrollTop = 220;
      await new Promise(resolve => setTimeout(resolve, 100));
      values.push(host.querySelector("#firstPane [data-scroll-key]").scrollTop);
      host.remove();
      return values;
    });
    assert.deepEqual(result, [350, 170, true, "cursorTest", 2, 4, 220]);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Shared scroll: real settings/prompt buttons, nested panes, focus, selection, details and subsequent scroll passed at desktop/mobile sizes.");
} finally {
  await browser.close();
  await server.close();
}
