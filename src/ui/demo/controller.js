import { createDemoPresentation } from "./presentation.js?v=20260719-first-visit-demo";
import { DEMO_WORKUP_ID } from "./session.js?v=20260719-first-visit-demo";

export function createDemoController({ byId, escapeHtml, getSession, getView }) {
  const presentation = createDemoPresentation({ escapeHtml });

  function activeReviewAction(content) {
    return content?.querySelector(
      '.section-editor.is-expanded [data-action="confirm-all-section-redactions"], ' +
      '.section-editor.is-expanded [data-action="keep-reviewed-redaction"], ' +
      '.section-editor.is-expanded [data-action="continue-section-review"]'
    ) || null;
  }

  function targetForStage(stage, stageId, view, content) {
    if ((stageId === "context-review" || stageId === "daily-review") && view === stage.view) {
      return activeReviewAction(content) || content.querySelector(stage.targetSelector);
    }
    return stage.navTarget
      ? document.querySelector(`button[data-view-target="${CSS.escape(stage.navTarget)}"]`)
      : view === stage.view
        ? content.querySelector(stage.targetSelector)
        : document.querySelector(`button[data-view-target="${CSS.escape(stage.view)}"]`);
  }

  function clearTargetDecorations() {
    document.querySelectorAll(".demo-next-action").forEach((element) => element.classList.remove("demo-next-action"));
    document.querySelectorAll("[data-demo-target]").forEach((element) => {
      element.removeAttribute("data-demo-target");
      element.removeAttribute("data-demo-target-label");
    });
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
    content.insertAdjacentHTML("afterbegin", presentation.renderGuide({
      session,
      currentView: view,
      reviewAction: target?.dataset.action || "",
      nextSectionLabel: target?.closest(".review-next-step")?.querySelector("strong")?.textContent?.replace(/^Next: review\s*/i, "") || ""
    }));
    if (!target) return;
    target.classList.add("demo-next-action");
    target.dataset.demoTarget = "true";
    target.dataset.demoTargetLabel = stage.targetLabel || "Click here";
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (!stage.navTarget && view === stage.view) target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setTimeout(() => {
      if (getSession()?.stage !== stageId) return;
      const currentTarget = targetForStage(stage, stageId, view, content);
      currentTarget?.classList.add("demo-next-action");
      if (currentTarget) {
        currentTarget.dataset.demoTarget = "true";
        currentTarget.dataset.demoTargetLabel = stage.targetLabel || "Click here";
      }
    }, 250);
  }

  function observeAction(action) {
    const session = getSession();
    if (!session) return;
    if (action === "add-demo-patient" && session.stage === "add-patient") session.stage = "save-context";
    if (action === "save-context") session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "context-review" : "save-day";
    if ((action === "keep-reviewed-redaction" || action === "confirm-all-section-redactions" || action === "continue-section-review") && !activeReviewAction(document.querySelector("#dailyContent"))) session.stage = session.stage === "daily-review" ? "open-workups" : "save-day";
    if (action === "save-day") session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "daily-review" : "open-workups";
    if (action === "build-checklist") session.stage = "answer-checklist";
    if (action === "copy-prompt") session.stage = "done";
    render();
  }

  function observeChange(target) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "select-workup" && target.matches?.(`.workup-checkbox[value="${DEMO_WORKUP_ID}"]`) && target.checked) session.stage = "build-checklist";
    if (session.stage === "answer-checklist" && target.matches?.(".checklist-answer") && (target.value || target.checked)) session.stage = "open-prompts";
    setTimeout(render, 0);
  }

  function observeNavigation(view) {
    const session = getSession();
    if (!session) return;
    if (session.stage === "open-workups" && view === "workups") session.stage = "select-workup";
    if (session.stage === "open-prompts" && view === "prompts") session.stage = "copy-prompt";
    render();
  }

  return { observeAction, observeChange, observeNavigation, render };
}
