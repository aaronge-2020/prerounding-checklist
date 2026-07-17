import { createDemoPresentation } from "./presentation.js?v=20260717-full-demo-case";
import { DEMO_WORKUP_ID } from "./session.js?v=20260717-full-demo-case";

export function createDemoController({ byId, escapeHtml, getSession, getView }) {
  const presentation = createDemoPresentation({ escapeHtml });

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
    content.insertAdjacentHTML("afterbegin", presentation.renderGuide({ session, currentView: view }));
    const stage = presentation.stageFor(session.stage);
    const target = stage.navTarget
      ? document.querySelector(`button[data-view-target="${CSS.escape(stage.navTarget)}"]`)
      : view === stage.view
        ? content.querySelector(stage.targetSelector)
        : document.querySelector(`button[data-view-target="${CSS.escape(stage.view)}"]`);
    if (!target) return;
    target.classList.add("demo-next-action");
    target.dataset.demoTarget = "true";
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function observeAction(action) {
    const session = getSession();
    if (!session) return;
    if (action === "save-context") session.stage = document.querySelector('[data-action="keep-reviewed-redaction"]') ? "context-review" : "save-day";
    if (action === "keep-reviewed-redaction" && !document.querySelector('[data-action="keep-reviewed-redaction"]')) session.stage = session.stage === "daily-review" ? "open-workups" : "save-day";
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
