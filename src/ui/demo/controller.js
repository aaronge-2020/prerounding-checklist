import {
  createDemoPresentation,
  DEMO_STAGE_NEXT,
  DEMO_INFO_STAGES,
  DEMO_PARSE_NOTE_TEXT,
  DEMO_DRUG_CHECK_MEDS,
  DEMO_AI_CHAT_QUESTION,
  DEMO_AI_CHAT_ANSWER
} from "./presentation.js?v=20261001-demo-fix-v1";
import { DEMO_DAY_ID, attachDemoObjectiveData } from "./session.js?v=20260930-demo-v3";

export const DEMO_REVIEW_ACTIONS = Object.freeze(new Set([
  "keep-reviewed-redaction",
  "confirm-all-section-redactions",
  "continue-section-review"
]));

export function demoReviewTransition(action, hasRemainingReview) {
  if (!DEMO_REVIEW_ACTIONS.has(action)) return "unrelated";
  return hasRemainingReview ? "preserve-review" : "complete-review";
}

export function createDemoController({ app, byId, escapeHtml, getSession, getView, render: renderApp, selectDemoPacket, getCheatSheetOpenId, seedAiChatDemo, clearAiChatDemo }) {
  const presentation = createDemoPresentation({ escapeHtml });
  let activeCalloutTarget = null;
  let calloutFrame = 0;
  let preparedStage = null;
  let preparing = false;
  let repositionTimer = 0;

  function visibleTarget(container, selector) {
    return [...(container?.querySelectorAll(selector) || [])].find((element) => element.getClientRects().length > 0) || null;
  }

  function activeReviewAction(content) {
    // The tour allows both step-by-step Accept and Confirm all: mark every
    // visible review action so the locked tour doesn't block the alternative.
    // Check each action in priority order; the caller marks all returned.
    const targets = [];
    for (const action of ["keep-reviewed-redaction", "confirm-all-section-redactions", "continue-section-review"]) {
      const target = visibleTarget(content, `.section-editor.is-expanded [data-action="${action}"]`);
      if (target) targets.push(target);
    }
    return targets;
  }

  function targetsForStage(stage, stageId, view, content) {
    if ((stageId === "context-review" || stageId === "daily-review") && view === stage.view) {
      const reviewTargets = activeReviewAction(content);
      if (reviewTargets.length) return reviewTargets;
      const fallback = visibleTarget(content, stage.targetSelector);
      return fallback ? [fallback] : [];
    }
    const single = stage.navTarget
      ? document.querySelector(`button[data-view-target="${CSS.escape(stage.navTarget)}"]`)
      : view === stage.view
        ? visibleTarget(content, stage.targetSelector)
        : document.querySelector(`button[data-view-target="${CSS.escape(stage.view)}"]`);
    return single ? [single] : [];
  }

  function clearTargetDecorations() {
    document.querySelectorAll(".demo-next-action").forEach((element) => {
      element.classList.remove("demo-next-action", "demo-pulse");
      element.style.position = "";
      element.style.zIndex = "";
    });
    document.querySelectorAll("[data-demo-target]").forEach((element) => element.removeAttribute("data-demo-target"));
    document.querySelectorAll("[data-demo-callout]").forEach((element) => element.remove());
    document.querySelectorAll("[data-demo-dim]").forEach((element) => element.remove());
    document.querySelectorAll("[data-demo-guide]").forEach((element) => element.remove());
    activeCalloutTarget = null;
    if (calloutFrame) cancelAnimationFrame(calloutFrame);
    calloutFrame = 0;
    if (repositionTimer) clearTimeout(repositionTimer);
    repositionTimer = 0;
  }

  // Explicit teardown for exit paths: removes every tour DOM node even if the
  // render cycle is interrupted or a view re-render wiped the guide bar.
  // Safe to call when no tour is active.
  function forceCleanup() {
    clearTargetDecorations();
    try { clearAiChatDemo?.(); } catch { /* ephemeral; never block exit */ }
    preparedStage = null;
  }

  function positionCallout() {
    const target = activeCalloutTarget;
    const callout = document.querySelector("[data-demo-callout]");
    if (!target?.isConnected || !callout) return;
    const rect = target.getBoundingClientRect();
    const margin = 16;
    const gap = 16;
    const calloutW = callout.offsetWidth;
    const calloutH = callout.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fitsRight = rect.right + gap + calloutW <= viewportWidth - margin;
    const fitsLeft = rect.left - gap - calloutW >= margin;
    const fitsBelow = rect.bottom + gap + calloutH <= viewportHeight - margin;
    const placement = fitsRight ? "right" : fitsLeft ? "left" : fitsBelow ? "bottom" : "top";
    const left = placement === "right"
      ? rect.right + gap
      : placement === "left"
        ? rect.left - calloutW - gap
        : Math.min(Math.max(margin, rect.left + rect.width / 2 - calloutW / 2), viewportWidth - calloutW - margin);
    const top = placement === "bottom"
      ? rect.bottom + gap
      : placement === "top"
        ? Math.max(margin, rect.top - calloutH - gap)
        : Math.min(Math.max(margin, rect.top + rect.height / 2 - calloutH / 2), viewportHeight - calloutH - margin);
    callout.dataset.placement = placement;
    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;
    // Keep the arrow pointed at the target center after viewport clamping:
    // the card edge may be clamped, but the arrow tracks the target.
    if (placement === "top" || placement === "bottom") {
      const arrowX = Math.min(Math.max(rect.left + rect.width / 2 - left, 16), Math.max(calloutW - 16, 16));
      callout.style.setProperty("--demo-arrow-x", `${Math.round(arrowX)}px`);
    } else {
      const arrowY = Math.min(Math.max(rect.top + rect.height / 2 - top, 16), Math.max(calloutH - 16, 16));
      callout.style.setProperty("--demo-arrow-y", `${Math.round(arrowY)}px`);
    }
  }

  function mountCallout(target, stage) {
    if (!target || !stage.callout) return;
    document.body.insertAdjacentHTML("beforeend", presentation.renderCallout({ stage }));
    activeCalloutTarget = target;
    calloutFrame = requestAnimationFrame(positionCallout);
  }

  function scheduleCalloutPosition() {
    if (!activeCalloutTarget) return;
    if (calloutFrame) cancelAnimationFrame(calloutFrame);
    calloutFrame = requestAnimationFrame(positionCallout);
  }

  document.addEventListener("scroll", scheduleCalloutPosition, true);
  window.addEventListener("resize", scheduleCalloutPosition);

  function flashDemoHint() {
    const target = document.querySelector("[data-demo-target]");
    if (target) {
      target.classList.remove("demo-pulse");
      void target.offsetWidth;
      target.classList.add("demo-pulse");
    }
    const hint = document.querySelector("[data-demo-hint]");
    if (hint) {
      hint.hidden = false;
      clearTimeout(flashDemoHint.timer);
      flashDemoHint.timer = setTimeout(() => { hint.hidden = true; }, 2400);
    }
  }

  function mountDim() {
    const dim = document.createElement("div");
    dim.className = "demo-dim";
    dim.dataset.demoDim = "true";
    dim.addEventListener("click", flashDemoHint);
    document.body.appendChild(dim);
  }

  // Stage-entry prefills: stage synthetic input through the real UI paths so
  // the tour demonstrates actual behavior, not canned screenshots.
  function prepareStage(stageId) {
    if (stageId === "parse-note") {
      // The admission note parser lives in the admission packet workspace.
      // Select it and ensure the primary-note paste UI is shown.
      // The textarea is filled after render (see render()).
      if (app.selectedStayPacketId !== "admission") app.selectedStayPacketId = "admission";
      if (app.admissionSourceKind !== "primary_note") app.admissionSourceKind = "primary_note";
    }
    if (stageId === "check-interactions") {
      app.drugChecks.medInput = DEMO_DRUG_CHECK_MEDS;
      app.drugChecks.result = null;
      app.drugChecks.status = "";
      app.drugChecks.dataState = "idle";
      app.drugChecks.dataError = "";
    }
    if (stageId === "open-ai-chat") {
      // Seed one pre-built exchange so the tour shows a grounded answer
      // without running a live model. Seeded only once per demo run.
      seedAiChatDemo?.({ question: DEMO_AI_CHAT_QUESTION, answer: DEMO_AI_CHAT_ANSWER });
    }
    if (stageId === "browse-cheat-sheet") {
      // Attach demo objective data when entering the cheat-sheet step.
      // Previously done in observeSheetOpened, but browse-cheat-sheet is now
      // an info stage (Issue 3 fix) so the user advances via Continue.
      app.vault = {
        ...app.vault,
        patients: (app.vault?.patients || []).map((patient) => patient.id === app.vault.activePatientId ? attachDemoObjectiveData(patient) : patient)
      };
    }
  }

  function render() {
    try { console.log("[demo] render() start, stage:", getSession()?.stage); } catch {}
    clearTargetDecorations();
    const session = getSession();
    if (!session) {
      // Every exit path funnels through here. The dim overlay, callout, and
      // highlight classes must not survive the demo, or the screen stays dark
      // and unclickable. Demo-seeded chat messages are ephemeral too.
      forceCleanup();
      return;
    }
    if (!preparing && preparedStage !== session.stage) {
      try { console.log("[demo] prepare block, stage:", session.stage); } catch {}
      preparing = true;
      prepareStage(session.stage);
      preparedStage = session.stage;
      preparing = false;
      renderApp();
        // Do NOT return early here. The guide bar must be rendered even on
      // the first pass after a stage change. Previously, the early return
      // left the tour with no visible UI (guide bar cleared but not re-added),
      // making it appear as if the tour had exited.
      // renderApp() is kept to ensure prepareStage state changes take effect.
    }
    const view = getView();
    const content = byId(`${view}Content`);
    if (!content) return;
    const stageId = session.stage;
    const stage = presentation.stageFor(stageId);
    const isInfo = DEMO_INFO_STAGES.has(stageId);
    const isComplete = stageId === "done";
    const targets = targetsForStage(stage, stageId, view, content);
    const target = targets[0] || null;
    // Note: browse-cheat-sheet is now an info stage (Issue 3 fix), so we do
    // NOT auto-advance here. The user presses Continue to advance, ensuring
    // the banner is always displayed.
    const routeMismatch = view !== stage.view;
    // The guide bar lives in document.body, NOT inside the view's content div.
    // View re-renders (e.g. AI Chat async init) wipe the content div, which
    // used to delete the guide bar while leaving the dim overlay and callout
    // behind — a dead-end with no Continue/Exit controls. In body, the bar
    // survives re-renders; render() removes and re-inserts it each cycle.
    try {
      // Remove any existing guide bar first (defensive, clearTargetDecorations should have done this)
      document.querySelectorAll("[data-demo-guide]").forEach((el) => el.remove());
      const guideHtml = presentation.renderGuide({
        session,
        currentView: view,
        reviewAction: target?.dataset.action || "",
        nextSectionLabel:
          target
            ?.closest(".review-next-step")
            ?.querySelector("strong")
            ?.textContent?.replace(/^Next: review\s*/i, "") || ""
      });
      try { console.log("[demo] inserting guide bar, html length:", guideHtml.length, "stage:", session.stage); } catch {}
      document.body.insertAdjacentHTML("afterbegin", guideHtml);
      try { console.log("[demo] guide bar inserted, found:", !!document.querySelector("[data-demo-guide]")); } catch {}
    } catch (err) {
    }
    if (!isComplete) mountDim();
    if (stageId === "parse-note" && view === "daily") {
      // Fill the admission paste textarea after render so the deterministic
      // parser sections the synthetic note. Only fills once.
      const textarea = content.querySelector('[data-structured-note-paste][data-structured-note-scope="admission"]');
      if (textarea && !String(textarea.value || "").trim()) {
        textarea.value = DEMO_PARSE_NOTE_TEXT;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    if (!target) return;
    // Action stages expose ONLY the highlighted controls above the dim layer;
    // info stages keep the full dim and advance via the guide bar's Continue.
    // Review stages may expose several valid actions (Accept, Confirm all).
    // Issue 2 fix: info stages with a route mismatch (e.g. open-scribe-pro)
    // still need their nav target clickable through the dim, so highlight it.
    const highlightForNav = isInfo && routeMismatch;
    if (!isInfo || highlightForNav) {
      for (const t of targets) {
        t.classList.add("demo-next-action");
        t.dataset.demoTarget = "true";
        // Issue 2 fix: ensure the target sits ABOVE the dim overlay (z-index 90).
        // The CSS .demo-next-action has z-index 2 which is below the dim.
        // Inline style overrides it to make the target clickable.
        t.style.position = "relative";
        t.style.zIndex = "95";
      }
    }
    if (!routeMismatch) mountCallout(target, stage);
    requestAnimationFrame(() => {
      if (!isInfo) target.focus({ preventScroll: true });
      if (!stage.navTarget && view === stage.view) target.scrollIntoView({ block: "center", behavior: "smooth" });
      scheduleCalloutPosition();
    });
    if (repositionTimer) clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => {
      repositionTimer = 0;
      if (getSession()?.stage !== stageId) return;
      try { console.log("[demo] reposition timer fired, stage:", stageId); } catch {}
      // CRITICAL: Do NOT call clearTargetDecorations() here - it removes the guide bar
      // ([data-demo-guide]) but this timer never re-renders it, leaving the tour with
      // no Continue/Exit controls. Only clear the dim, callout, and spotlight;
      // the guide bar in document.body must survive.
      document.querySelectorAll(".demo-next-action").forEach((element) => element.classList.remove("demo-next-action", "demo-pulse"));
      document.querySelectorAll("[data-demo-target]").forEach((element) => element.removeAttribute("data-demo-target"));
      document.querySelectorAll("[data-demo-callout]").forEach((element) => element.remove());
      document.querySelectorAll("[data-demo-dim]").forEach((element) => element.remove());
      // Guide bar ([data-demo-guide]) is intentionally NOT removed here.
      try { console.log("[demo] timer: guide bar preserved:", !!document.querySelector("[data-demo-guide]")); } catch {}
      if (getSession()?.stage !== "done") mountDim();
      const currentTargets = targetsForStage(stage, stageId, view, content);
      const currentTarget = currentTargets[0] || null;
      if (!currentTarget) return;
      const timerHighlightForNav = isInfo && routeMismatch;
      if (!isInfo || timerHighlightForNav) {
        for (const t of currentTargets) {
          t.classList.add("demo-next-action");
          t.dataset.demoTarget = "true";
          t.style.position = "relative";
          t.style.zIndex = "95";
        }
      }
      if (!routeMismatch) mountCallout(currentTarget, stage);
    }, 250);
  }

  function observeAction(action) {
    const session = getSession();
    if (!session) return;
    // Issue 4 fix: Handle exit-guided-demo directly in the controller.
    // Previously relied on the main app, but vault interaction during demo
    // could leave the banner orphaned with a non-responsive Exit button.
    if (action === "exit-guided-demo") {
      forceCleanup();
      renderApp();
      return;
    }
    if (action === "advance-guided-demo") {
      const next = DEMO_STAGE_NEXT[session.stage];
      if (next) {
        session.stage = next;
        renderApp();
      }
      return;
    }
    if (action === "add-admission-source") {
      if (document.querySelector('[data-action="keep-reviewed-redaction"]')) session.stage = "context-review";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    const reviewTransition = demoReviewTransition(action, activeReviewAction(document.querySelector("#dailyContent")).length > 0);
    if (reviewTransition !== "unrelated") {
      if (reviewTransition === "preserve-review") {
        render();
        return;
      }
      if (session.stage === "daily-review") session.stage = "parse-note";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    if (action === "add-daily-source")
      session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "daily-review" : "parse-note";
    if (action === "drug-checks-check") {
      // Fires only via the controller's onCheckComplete callback, i.e. after
      // a successful check whose results are already painted. Never advance
      // on the click alone (the check is async); and only from the matching
      // stage so stray checks can't skip the tour ahead.
      if (session.stage === "check-interactions") session.stage = "open-ai-chat";
      renderApp();
      return;
    }
    if (action === "copy-prompt") session.stage = "done";
    renderApp();
  }

  // The guided demo requires the exact ACS sheet: opening any other sheet
  // must not advance the demo past the cheat-sheets stage.
  function observeSheetOpened(sheetId) {
    const session = getSession();
    if (!session || session.stage !== "browse-cheat-sheet") return;
    if (sheetId !== "acute-coronary-syndrome") return;
    app.vault = {
      ...app.vault,
      patients: (app.vault?.patients || []).map((patient) => patient.id === app.vault.activePatientId ? attachDemoObjectiveData(patient) : patient)
    };
    session.stage = "open-review";
    renderApp();
  }

  function observeChange(target) {
    const session = getSession();
    if (!session) return;
    setTimeout(render, 0);
  }

  function observeInput() {}

  function observeDraftSaved() {
    // write-note is now an info stage (Step 16) with a Continue button.
    // Do not auto-advance on draft save; the user advances via Continue.
    // (Previously this skipped the Step 16 banner entirely.)
  }

  function observeNavigation(view) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "open-drug-checks" && view === "drugChecks") session.stage = "check-interactions";
    if (session.stage === "open-ai-chat" && view === "aiChat") session.stage = "ai-chat-models";
    if (session.stage === "open-cheat-sheets" && view === "cheatSheets") session.stage = "browse-cheat-sheet";
    if (session.stage === "open-review" && view === "review") session.stage = "write-note";
    if (session.stage === "open-scribe-pro" && view === "scribePro") session.stage = "scribe-pro-voice";
    if (session.stage === "open-prompts" && view === "prompts") session.stage = "copy-prompt";
    renderApp();
  }

  return { observeAction, observeChange, observeDraftSaved, observeInput, observeNavigation, observeSheetOpened, render, forceCleanup };
}
