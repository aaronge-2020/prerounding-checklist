import { createDemoPresentation } from "./presentation.js?v=20260815-single-redaction-accept";
import { DEMO_DAY_ID, DEMO_REQUIRED_ANSWER_ITEM_ID, DEMO_WORKUP_ID, prefillDemoChecklist } from "./session.js?v=20260809-demo-nstemi-workup-1";

export const DEMO_REVIEW_ACTIONS = Object.freeze(new Set([
  "keep-reviewed-redaction",
  "confirm-all-section-redactions",
  "continue-section-review"
]));

export function demoReviewTransition(action, hasRemainingReview) {
  if (!DEMO_REVIEW_ACTIONS.has(action)) return "unrelated";
  return hasRemainingReview ? "preserve-review" : "complete-review";
}

export function createDemoController({ app, byId, escapeHtml, getSession, getView, render: renderApp, selectDemoPacket }) {
  const presentation = createDemoPresentation({ escapeHtml });
  let activeCalloutTarget = null;
  let calloutFrame = 0;

  function visibleTarget(container, selector) {
    return [...(container?.querySelectorAll(selector) || [])].find((element) => element.getClientRects().length > 0) || null;
  }

  function activeReviewAction(content) {
    return visibleTarget(
      content,
      '.section-editor.is-expanded [data-action="keep-reviewed-redaction"], ' +
        '.section-editor.is-expanded [data-action="confirm-all-section-redactions"], ' +
        '.section-editor.is-expanded [data-action="continue-section-review"]'
    );
  }

  function targetForStage(stage, stageId, view, content) {
    if ((stageId === "context-review" || stageId === "daily-review") && view === stage.view) {
      return activeReviewAction(content) || visibleTarget(content, stage.targetSelector);
    }
    return stage.navTarget
      ? document.querySelector(`button[data-view-target="${CSS.escape(stage.navTarget)}"]`)
      : view === stage.view
        ? visibleTarget(content, stage.targetSelector)
        : document.querySelector(`button[data-view-target="${CSS.escape(stage.view)}"]`);
  }

  function clearTargetDecorations() {
    document.querySelectorAll(".demo-next-action").forEach((element) => element.classList.remove("demo-next-action"));
    document.querySelectorAll("[data-demo-target]").forEach((element) => element.removeAttribute("data-demo-target"));
    document.querySelectorAll("[data-demo-callout]").forEach((element) => element.remove());
    activeCalloutTarget = null;
    if (calloutFrame) cancelAnimationFrame(calloutFrame);
    calloutFrame = 0;
  }

  function positionCallout() {
    const target = activeCalloutTarget;
    const callout = document.querySelector("[data-demo-callout]");
    if (!target?.isConnected || !callout) return;
    const rect = target.getBoundingClientRect();
    const margin = 16;
    const gap = 16;
    const width = callout.offsetWidth;
    const height = callout.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fitsRight = rect.right + gap + width <= viewportWidth - margin;
    const fitsLeft = rect.left - gap - width >= margin;
    const fitsBelow = rect.bottom + gap + height <= viewportHeight - margin;
    const placement = fitsRight ? "right" : fitsLeft ? "left" : fitsBelow ? "bottom" : "top";
    const left = placement === "right"
      ? rect.right + gap
      : placement === "left"
        ? rect.left - width - gap
        : Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), viewportWidth - width - margin);
    const top = placement === "bottom"
      ? rect.bottom + gap
      : placement === "top"
        ? Math.max(margin, rect.top - height - gap)
        : Math.min(Math.max(margin, rect.top + rect.height / 2 - height / 2), viewportHeight - height - margin);
    callout.dataset.placement = placement;
    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;
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

  function render() {
    document.querySelectorAll("[data-demo-guide]").forEach((element) => element.remove());
    clearTargetDecorations();
    const session = getSession();
    if (!session) return;
    const view = getView();
    const content = byId(`${view}Content`);
    if (!content) return;
    const stageId = session.stage;
    const stage = presentation.stageFor(stageId);
    const target = targetForStage(stage, stageId, view, content);
    const routeMismatch = view !== stage.view;
    content.insertAdjacentHTML(
      "afterbegin",
      presentation.renderGuide({
        session,
        currentView: view,
        reviewAction: target?.dataset.action || "",
        nextSectionLabel:
          target
            ?.closest(".review-next-step")
            ?.querySelector("strong")
            ?.textContent?.replace(/^Next: review\s*/i, "") || ""
      })
    );
    if (!target) return;
    target.classList.add("demo-next-action");
    target.dataset.demoTarget = "true";
    if (!routeMismatch) mountCallout(target, stage);
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (!stage.navTarget && view === stage.view) target.scrollIntoView({ block: "center", behavior: "smooth" });
      scheduleCalloutPosition();
    });
    setTimeout(() => {
      if (getSession()?.stage !== stageId) return;
      clearTargetDecorations();
      const currentTarget = targetForStage(stage, stageId, view, content);
      currentTarget?.classList.add("demo-next-action");
      if (currentTarget) {
        currentTarget.dataset.demoTarget = "true";
        if (!routeMismatch) mountCallout(currentTarget, stage);
      }
    }, 250);
  }

  function observeAction(action) {
    const session = getSession();
    if (!session) return;
    if (action === "add-admission-source") {
      if (document.querySelector('[data-action="keep-reviewed-redaction"]')) session.stage = "context-review";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    const reviewTransition = demoReviewTransition(action, Boolean(activeReviewAction(document.querySelector("#dailyContent"))));
    if (reviewTransition !== "unrelated") {
      if (reviewTransition === "preserve-review") {
        render();
        return;
      }
      if (session.stage === "daily-review") session.stage = "open-workups";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    if (action === "add-daily-source")
      session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "daily-review" : "open-workups";
    if (action === "build-checklist") {
      app.vault = {
        ...app.vault,
        patients: (app.vault?.patients || []).map((patient) => patient.id === app.vault.activePatientId ? prefillDemoChecklist(patient) : patient)
      };
      session.stage = "answer-checklist";
    }
    if (action === "copy-prompt") session.stage = session.stage === "copy-prompt" ? "open-teaching" : "done";
    renderApp();
  }

  function observeChange(target) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "select-workup" && target.matches?.(`.workup-checkbox[value="${DEMO_WORKUP_ID}"]`) && target.checked)
      session.stage = "build-checklist";
    if (session.stage === "answer-checklist" && target.matches?.(`.checklist-answer[name="${DEMO_REQUIRED_ANSWER_ITEM_ID}"]`) && (target.value || target.checked))
      session.stage = "open-prompts";
    if (session.stage === "open-teaching" && target.id === "promptTaskSelect" && target.value === "teaching_case_trajectory")
      session.stage = "teaching-showcase";
    setTimeout(render, 0);
  }

  function observeNavigation(view) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "open-workups" && view === "workups") session.stage = "select-workup";
    if (session.stage === "open-prompts" && view === "prompts") session.stage = "copy-prompt";
    renderApp();
  }

  return { observeAction, observeChange, observeNavigation, render };
}
