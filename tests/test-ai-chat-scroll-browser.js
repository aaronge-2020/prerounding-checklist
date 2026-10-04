// Regression test: AI Chat buttons must not reset scroll position.
// Covers the "clicking a button scrolls me to the top" bug class for the
// ai-chat render path, which swaps the whole view content with innerHTML.
// The route scroller must keep its position across Context / Compress /
// mode-tab clicks. (Messages-pane stick-to-bottom math is unit-tested in
// test-view-scroll.js via chatPaneScrollTop.)
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const baseUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
// Short viewport: the AI Chat column (chatbar + messages + composer) exceeds
// it, so the route .view itself becomes the scroll owner with no messages.
const context = await browser.newContext({ viewport: { width: 1280, height: 340 } });
const page = await context.newPage();

async function viewScrollTop() {
  return page.evaluate(() => document.querySelector(".view.active")?.scrollTop ?? -1);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  if (await page.locator("#newPatientLabel").count()) {
    await page.fill("#newPatientLabel", "Synthetic Room");
    await page.click('[data-action="admit-patient"]');
  }
  await page.waitForSelector("#dailyContent .source-first-stay");

  await page.click('[data-view-target="aiChat"]');
  await page.waitForSelector("#aiChatContent [data-ai-chat-messages]");
  const max = await page.evaluate(() => {
    const v = document.querySelector(".view.active");
    return v ? v.scrollHeight - v.clientHeight : 0;
  });
  assert.ok(max > 200, `the AI Chat view must be scrollable at a short viewport (max ${max})`);

  async function clickAndAssertStable(selector, label) {
    await page.evaluate(() => {
      const v = document.querySelector(".view.active");
      v.scrollTop = v.scrollHeight;
    });
    await page.waitForTimeout(100);
    const before = await viewScrollTop();
    assert.ok(before > 100, `${label}: precondition — view scrolled down (got ${before})`);
    await page.locator(selector).dispatchEvent("click");
    await page.waitForTimeout(400);
    const after = await viewScrollTop();
    // The click may legitimately change the content height (e.g. the Context
    // sidebar opens/closes); then the correct behavior is keeping the old
    // position clamped to the new maximum — never a reset to the top.
    const maxAfter = await page.evaluate(() => {
      const v = document.querySelector(".view.active");
      return v ? v.scrollHeight - v.clientHeight : 0;
    });
    const expected = Math.min(before, Math.max(0, maxAfter));
    assert.ok(
      Math.abs(after - expected) < 24,
      `${label}: view scroll must survive the click (before ${before}, after ${after}, expected ~${expected})`
    );
  }

  // Context inspector toggle re-renders the whole view.
  await clickAndAssertStable('[data-action="ai-chat-context-inspector"]', "Context inspector open");
  await clickAndAssertStable('[data-action="ai-chat-context-inspector"]', "Context inspector close");
  // Mode tabs re-render the whole view.
  await clickAndAssertStable('[data-action="ai-chat-mode"][data-mode="remote"]', "ChatGPT mode tab");
  await clickAndAssertStable('[data-action="ai-chat-mode"][data-mode="local"]', "On-device mode tab");
  // Compress with too little history still re-renders (status message path).
  await clickAndAssertStable('[data-action="ai-chat-compress"]', "Compress");

  console.log("ai-chat scroll regression tests passed");
} finally {
  await browser.close();
}
