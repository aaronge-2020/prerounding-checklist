export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": {
    view: "daily",
    targetSelector: '[data-action="save-context"]',
    title: "Start with the sample case",
    instruction: "Click Save admission packet.",
    helper: "This is a safe sample—no real patient data is used."
  },
  "context-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the highlighted changes",
    instruction: "Review the highlighted changes, then click Confirm rest.",
    helper: "You check the app's suggestions before moving on."
  },
  "save-day": {
    view: "daily",
    targetSelector: '[data-action="save-day"]',
    title: "Add the day-one update",
    instruction: "Click Save hospital day.",
    helper: "This adds the next part of the sample case."
  },
  "daily-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the day-one changes",
    instruction: "Review the highlighted changes, then continue through the fields.",
    helper: "Each part of the case gets its own quick review."
  },
  "open-workups": {
    view: "workups",
    navTarget: "workups",
    title: "Choose checklist questions",
    instruction: "Click Workups in the sidebar.",
    helper: "Next, you'll choose questions for the checklist."
  },
  "select-workup": {
    view: "workups",
    targetSelector: '.workup-checkbox[value="general-admission"]',
    title: "Choose a question set",
    instruction: "Select General admission.",
    helper: "This chooses the questions for the checklist."
  },
  "build-checklist": {
    view: "workups",
    targetSelector: '.workup-editor-header-actions [data-action="build-checklist"]',
    title: "Build the checklist",
    instruction: "Click Build checklist.",
    helper: "This turns your selected questions into a checklist."
  },
  "answer-checklist": {
    view: "checklist",
    targetSelector: '#checklistSections > .checklist-section:first-child .checklist-item:first-child .checklist-answer',
    title: "Answer a checklist question",
    instruction: "Choose an answer for the highlighted question.",
    helper: "Your answer helps shape the evidence prompt."
  },
  "open-prompts": {
    view: "prompts",
    navTarget: "prompts",
    title: "Open the prompt builder",
    instruction: "Click OpenEvidence Prompts in the sidebar.",
    helper: "The prompt is built from the case you reviewed."
  },
  "copy-prompt": {
    view: "prompts",
    targetSelector: '[data-action="copy-prompt"]',
    title: "Copy the prompt",
    instruction: "Click Copy prompt.",
    helper: "Only the reviewed prompt is copied."
  },
  done: {
    view: "prompts",
    title: "Demo complete",
    instruction: "You followed the full sample workflow.",
    helper: "Nothing from this demo was written to your vault."
  }
});

export function demoStage(stageId) {
  return DEMO_GUIDE_STAGES[stageId] || DEMO_GUIDE_STAGES["save-context"];
}

export function createDemoPresentation({ escapeHtml }) {
  function renderGuide({ session, currentView, reviewAction = "", nextSectionLabel = "" }) {
    const stage = demoStage(session.stage);
    const stageIds = Object.keys(DEMO_GUIDE_STAGES);
    const step = Math.max(1, stageIds.indexOf(session.stage) + 1);
    const isComplete = session.stage === "done";
    const routeMismatch = !isComplete && currentView !== stage.view;
    const reviewHandoff = reviewAction === "continue-section-review"
      ? `The previous field is complete. Click Continue to next field to review ${nextSectionLabel || "the next field"}.`
      : "";
    const nextInstruction = routeMismatch
      ? `Open ${stage.view === "workups" ? "Workups" : stage.view === "prompts" ? "OpenEvidence Prompts" : stage.view} with the highlighted sidebar control to continue.`
      : reviewHandoff || stage.instruction;
    return `
      <section class="guided-demo-bar" data-demo-guide role="status" aria-live="polite">
        <div class="guided-demo-heading">
          <span class="guided-demo-kicker">Guided demo</span>
          <span class="guided-demo-step">${isComplete ? "Complete" : `Step ${step} of ${stageIds.length - 1}`}</span>
        </div>
        <div class="guided-demo-copy">
          <strong>${escapeHtml(stage.title)}</strong>
          <div class="guided-demo-instructions">
            <span class="guided-demo-action">${escapeHtml(nextInstruction)}</span>
            ${!routeMismatch && stage.helper ? `<span class="guided-demo-note">${escapeHtml(stage.helper)}</span>` : ""}
          </div>
        </div>
        <div class="guided-demo-actions">
          <span class="guided-demo-badge">Synthetic sample</span>
          <button class="button--quiet guided-demo-exit" type="button" data-action="exit-guided-demo">Exit demo</button>
        </div>
      </section>
    `;
  }

  return { renderGuide, stageFor: demoStage };
}
