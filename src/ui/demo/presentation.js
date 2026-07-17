export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": { view: "daily", targetSelector: '[data-action="save-context"]', title: "Save the synthetic admission packet", instruction: "The packet is preloaded below. Click the highlighted Save admission packet button to run local de-identification." },
  "context-review": { view: "daily", targetSelector: '[data-action="confirm-all-section-redactions"]', title: "Review the admission redactions", instruction: "Review the visible replacements, then use Confirm rest. The app will move to the next field automatically." },
  "save-day": { view: "daily", targetSelector: '[data-action="save-day"]', title: "Save the hospital-day update", instruction: "Click the highlighted Save hospital day button to run local de-identification on the HD1 update." },
  "daily-review": { view: "daily", targetSelector: '[data-action="confirm-all-section-redactions"]', title: "Review the hospital-day redactions", instruction: "Review the visible date replacements, then use Confirm rest before continuing." },
  "open-workups": { view: "workups", navTarget: "workups", title: "Open Workups", instruction: "Move to the Workups screen using the highlighted sidebar control." },
  "select-workup": { view: "workups", targetSelector: '.workup-checkbox[value="general-admission"]', title: "Choose a workup", instruction: "Select General admission from the real catalog. This populates the checklist builder." },
  "build-checklist": { view: "workups", targetSelector: '.workup-editor-header-actions [data-action="build-checklist"]', title: "Build the checklist", instruction: "Use the actual Build checklist action after selecting the workup." },
  "answer-checklist": { view: "checklist", targetSelector: '#checklistSections > .checklist-section:first-child .checklist-item:first-child .checklist-answer', title: "Answer a checklist question", instruction: "Choose an answer in the real checklist. The demo accepts any answer and then points you to the evidence prompt." },
  "open-prompts": { view: "prompts", navTarget: "prompts", title: "Open OpenEvidence Prompts", instruction: "Open the prompt builder from the highlighted sidebar control." },
  "copy-prompt": { view: "prompts", targetSelector: '[data-action="copy-prompt"]', title: "Copy the de-identified prompt", instruction: "Use the real Copy prompt action. Only the de-identified prompt is copied; the demo does not send anything to an external service." },
  done: { view: "prompts", title: "Demo complete", instruction: "You used the real path from a synthetic note to a reviewed checklist and a de-identified evidence prompt. Nothing from this demo was written to your vault." }
});

export function demoStage(stageId) {
  return DEMO_GUIDE_STAGES[stageId] || DEMO_GUIDE_STAGES["save-context"];
}

export function createDemoPresentation({ escapeHtml }) {
  function renderGuide({ session, currentView }) {
    const stage = demoStage(session.stage);
    const stageIds = Object.keys(DEMO_GUIDE_STAGES);
    const step = Math.max(1, stageIds.indexOf(session.stage) + 1);
    const isComplete = session.stage === "done";
    const routeMismatch = !isComplete && currentView !== stage.view;
    const instruction = routeMismatch
      ? `Open ${stage.view === "workups" ? "Workups" : stage.view === "prompts" ? "OpenEvidence Prompts" : stage.view} with the highlighted sidebar control to continue.`
      : stage.instruction;
    return `
      <section class="guided-demo-bar" data-demo-guide role="status" aria-live="polite">
        <div class="guided-demo-step">Guided demo · ${isComplete ? "Complete" : `Step ${step} of ${stageIds.length - 1}`}</div>
        <div class="guided-demo-copy">
          <strong>${escapeHtml(stage.title)}</strong>
          <span>${escapeHtml(instruction)}</span>
        </div>
        <span class="guided-demo-badge">Synthetic only</span>
        <button class="button--quiet" type="button" data-action="restart-guided-demo">Restart demo</button>
      </section>
    `;
  }

  return { renderGuide, stageFor: demoStage };
}
