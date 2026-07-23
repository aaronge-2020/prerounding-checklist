import { createDemoPresentation } from "./presentation.js?v=20260717-guided-demo-ux-4";
import { DEMO_DAY_ID, DEMO_WORKUP_ID } from "./session.js?v=20260717-guided-demo-ux-4";

export function createDemoController({ app, byId, escapeHtml, getSession, getView, render: renderApp, selectDemoPacket }) {
  const presentation = createDemoPresentation({ escapeHtml });

  function visibleTarget(container, selector) {
    return [...(container?.querySelectorAll(selector) || [])].find((element) => element.getClientRects().length > 0) || null;
  }

  function activeReviewAction(content) {
    return visibleTarget(
      content,
      '.section-editor.is-expanded [data-action="confirm-all-section-redactions"], ' +
        '.section-editor.is-expanded [data-action="keep-reviewed-redaction"], ' +
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
  }

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
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (!stage.navTarget && view === stage.view) target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setTimeout(() => {
      if (getSession()?.stage !== stageId) return;
      clearTargetDecorations();
      const currentTarget = targetForStage(stage, stageId, view, content);
      currentTarget?.classList.add("demo-next-action");
      if (currentTarget) currentTarget.dataset.demoTarget = "true";
    }, 250);
  }

  function observeAction(action) {
    const session = getSession();
    if (!session) return;
    if (action === "save-context") {
      if (document.querySelector('[data-action="keep-reviewed-redaction"]')) session.stage = "context-review";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    if (
      (action === "keep-reviewed-redaction" || action === "confirm-all-section-redactions" || action === "continue-section-review") &&
      !activeReviewAction(document.querySelector("#dailyContent"))
    ) {
      if (session.stage === "daily-review") session.stage = "open-workups";
      else {
        app.selectedStayPacketId = DEMO_DAY_ID;
        selectDemoPacket();
        session.stage = "save-day";
      }
    }
    if (action === "save-day")
      session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "daily-review" : "open-workups";
    if (action === "build-checklist") session.stage = "answer-checklist";
    if (action === "copy-prompt") session.stage = "done";
    renderApp();
  }

  function observeChange(target) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "select-workup" && target.matches?.(`.workup-checkbox[value="${DEMO_WORKUP_ID}"]`) && target.checked)
      session.stage = "build-checklist";
    if (session.stage === "answer-checklist" && target.matches?.(".checklist-answer") && (target.value || target.checked))
      session.stage = "open-prompts";
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
