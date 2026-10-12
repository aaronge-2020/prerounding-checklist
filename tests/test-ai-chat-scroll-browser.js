import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createAppServer } from "./browser/app-harness.js";
const server = await createAppServer();
const browser = await chromium.launch();
const measurements = [];
const out = process.env.SCROLL_REVIEW_ARTIFACTS;
if (out) await mkdir(out, { recursive: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    console.log(`Testing review at ${viewport.width}px`);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.baseUrl}tests/browser/scroll-review.html`);
    await page.locator('[data-action="ai-chat-mode"][data-mode="remote"]').click();
    await page.evaluate(() => { window.controller.getRemoteState().toolsEnabled = false; window.controller.render(); });
    await page.locator("[data-ai-chat-input]").fill("Review this synthetic case for SyntheticName.");
    await page.evaluate(() => window.controller.render());
    assert.equal(await page.locator("[data-ai-chat-input]").innerText(), "Review this synthetic case for SyntheticName.", "background updates retain the typed draft");
    await page.locator('[data-action="ai-chat-send-remote"]').click();
    await page.waitForFunction(() => ["ready", "failed"].includes(window.controller.getRemoteReview()?.phase)).catch(async error => {
      console.log(await page.evaluate(() => ({ status: window.fixtureStatus, review: window.controller.getRemoteReview(), input: document.querySelector("[data-ai-chat-input]")?.textContent })), errors);
      throw error;
    });
    assert.equal(await page.evaluate(() => window.controller.getRemoteReview()?.phase), "ready", await page.evaluate(() => JSON.stringify(window.controller.getRemoteReview())));
    console.log("Review ready");
    const body = page.locator(".aic-hipaa-body");
    const confirm = page.locator('[data-action="ai-chat-hipaa-confirm"]');
    assert.equal(await confirm.isDisabled(), true);
    assert.equal(await page.evaluate(() => window.sent.length), 0);
    assert.equal(await page.locator('[data-scroll-key="outgoing-payload"]').getAttribute("open"), null);
    async function stableClick(locator, label) {
      await locator.scrollIntoViewIfNeeded();
      const before = await body.evaluate(el => el.scrollTop);
      const box = await locator.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      const after = await body.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
      assert.ok(Math.abs(after.top - Math.min(before, after.max)) <= 2,
        `${viewport.width} ${label}: ${before} -> ${after.top}, max ${after.max}`);
      measurements.push({ width: viewport.width, action: label, pointerTargets: 1, clicks: 1,
        recoveryScrolls: 0, before, after: after.top });
    }
    const heads = page.locator('[data-action="ai-chat-hipaa-piece"]');
    const pieceId = await heads.nth(5).getAttribute("data-piece");
    await page.locator("[data-ai-chat-review-jump]").selectOption(pieceId);
    const piece = page.locator(`[data-hipaa-piece-id="${pieceId}"]`);
    assert.ok(await body.evaluate(el => el.scrollTop) > 100);
    const preview = piece.locator("[data-hipaa-piece-preview]");
    await preview.evaluate(el => { el.scrollTop = 120; });
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-accept"]').nth(2), "accept suggestion");
    assert.equal(await preview.evaluate(el => el.scrollTop), 120);
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-reject"]').nth(2), "reject suggestion");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-toggle-reviewed"]'), "show reviewed");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-undo"]').first(), "undo acceptance");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-restore"]').first(), "restore rejected redaction");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-accept-all"]'), "accept document");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-piece"]'), "collapse document");
    await stableClick(piece.locator('[data-action="ai-chat-hipaa-piece"]'), "expand document");
    // Select exact text with a real pointer drag, then apply manual redaction.
    await page.locator("[data-ai-chat-review-jump]").selectOption(pieceId);
    await preview.evaluate(el => { el.scrollTop = 0; });
    await preview.scrollIntoViewIfNeeded();
    if (out) await page.screenshot({ path: `${out}/pending-${viewport.width}.png` });
    const targetRect = await preview.evaluate(el => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const at = walk.currentNode.textContent.indexOf("ManualTarget");
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(walk.currentNode, at); range.setEnd(walk.currentNode, at + 12);
        const r = range.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    });
    await page.mouse.move(targetRect.x + 1, targetRect.y + targetRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetRect.x + targetRect.width - 1, targetRect.y + targetRect.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.locator("[data-hipaa-redact-float]").click();
    assert.ok(await page.evaluate(id => window.controller.getRemoteReview().pieces.find(p => p.id === id).manualRecords.length > 0, pieceId));
    await page.locator("[data-ai-chat-review-jump]").selectOption("outgoing-payload");
    assert.equal(await page.locator('[data-scroll-key="outgoing-payload"]').evaluate(el => el.open), true);
    const payload = page.locator('[data-scroll-key="outgoing-text"]');
    await payload.evaluate(el => { el.scrollTop = 150; });
    await stableClick(page.locator("#aiChatReviewAck"), "acknowledge with pending suggestions");
    assert.equal(await confirm.isDisabled(), true);
    assert.equal(await payload.evaluate(el => el.scrollTop), 150);
    assert.equal(await page.locator('[data-scroll-key="outgoing-payload"]').evaluate(el => el.open), true);
    await stableClick(page.locator('[data-action="ai-chat-hipaa-accept-all-pending"]'), "accept remaining suggestions");
    assert.equal(await confirm.isEnabled(), true);
    await body.hover();
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(80);
    const wheelTop = await body.evaluate(el => el.scrollTop);
    await page.waitForTimeout(150);
    assert.equal(await body.evaluate(el => el.scrollTop), wheelTop);
    if (out) await page.screenshot({ path: `${out}/review-${viewport.width}.png` });
    await confirm.click();
    await page.waitForFunction(() => window.sent.length === 1);
    assert.ok(!(await page.evaluate(() => JSON.stringify(window.sent[0]))).includes("SyntheticName"));
    assert.equal(await page.locator(".aic-hipaa-modal").count(), 0);
    // Replacing the chat pane must read its geometry BEFORE detaching it.
    await page.evaluate(() => {
      window.controller.getRemoteState().messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "Synthetic reviewed message. ".repeat(30) }));
      window.controller.render();
      document.querySelector("[data-ai-chat-messages]").scrollTop = 200;
    });
    const chatTop = await page.locator("[data-ai-chat-messages]").evaluate(el => el.scrollTop);
    if (chatTop > 0) {
      await page.locator('[data-action="ai-chat-context-inspector"]').click();
      assert.equal(await page.locator("[data-ai-chat-messages]").evaluate(el => el.scrollTop), chatTop);
      await page.locator('[data-action="ai-chat-context-inspector"]').click();
      assert.equal(await page.locator("[data-ai-chat-messages]").evaluate(el => el.scrollTop), chatTop);
    } else {
      const positions = await page.evaluate(() => {
        document.scrollingElement.scrollTop = 500;
        const before = document.scrollingElement.scrollTop;
        window.controller.render();
        return [before, document.scrollingElement.scrollTop];
      });
      assert.ok(positions[0] > 0);
      assert.equal(positions[1], positions[0], "mobile document scroll survives background updates");
    }
    // Cancel and model failure must send nothing, and keyboard stays in dialog.
    await page.locator("[data-ai-chat-input]").fill("A new message for SyntheticName");
    await page.locator('[data-action="ai-chat-send-remote"]').click();
    await page.waitForFunction(() => window.controller.getRemoteReview()?.phase === "ready");
    await page.locator('.aic-hipaa-foot [data-action="ai-chat-hipaa-cancel"]').focus();
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement.closest(".aic-hipaa-modal")));
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".aic-hipaa-modal").count(), 0);
    assert.equal(await page.locator("[data-ai-chat-input]").innerText(), "A new message for SyntheticName");
    await page.evaluate(() => { window.failModel = true; });
    await page.locator('[data-action="ai-chat-send-remote"]').click();
    await page.waitForFunction(() => window.controller.getRemoteReview()?.phase === "failed");
    assert.equal(await confirm.count(), 0, "failed inference offers no send button");
    assert.equal(await page.evaluate(() => window.sent.length), 1, "cancel and failed inference never send");
    await page.keyboard.press("Escape");
    await page.locator("[data-ai-chat-input]").fill("Do not carry this draft to another patient");
    await page.evaluate(() => {
      const app = window.fixtureApp;
      app.vault.patients.push({ id: "other", displayLabel: "Other synthetic room", contextSections: [], days: [] });
      app.vault.activePatientId = "other";
      window.controller.render();
    });
    assert.equal(await page.locator("[data-ai-chat-input]").innerText(), "", "drafts remain patient scoped");
    assert.deepEqual(errors, []);
    await page.close();
  }
  if (out) await writeFile(`${out}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(`AI-chat review: ${measurements.length} measured pointer actions passed across desktop/mobile; send gating and payload checked.`);
} finally {
  await browser.close();
  await server.close();
}
