export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": {
    view: "daily",
    targetSelector: '[data-action="add-admission-source"]',
    title: "Start with the sample case",
    instruction: "Click De-identify and add source.",
    explanationTitle: "Why you start here",
    explanation: "This synthetic packet lets you practice the workflow without changing your own vault. In normal use, you paste one source at a time and review de-identification before saving it."
  },
  "context-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the highlighted changes",
    instruction: "Review the highlighted changes, then click Confirm rest.",
    explanationTitle: "What this review does",
    explanation: "The app marks possible identifiers for your decision. Confirming a change saves only the de-identified replacement; the original text stays in this active review only."
  },
  "save-day": {
    view: "daily",
    targetSelector: '[data-action="add-daily-source"]',
    title: "Add the day-one update",
    instruction: "Click De-identify and add source.",
    explanation: "Adding the day-one source keeps today’s evidence separate from admission context, so the prompt can distinguish current findings from the original presentation."
  },
  "daily-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the day-one changes",
    instruction: "Review the highlighted changes, then continue through the fields.",
    explanationTitle: "Why the day is reviewed separately",
    explanation: "Selected-day information is reviewed on its own so the prompt can distinguish current findings from admission history."
  },
  "open-workups": {
    view: "workups",
    navTarget: "workups",
    title: "Choose checklist questions",
    instruction: "Click Workups in the sidebar.",
    helper: ""
  },
  "select-workup": {
    view: "workups",
    targetSelector: '.workup-checkbox[value="general-admission"]',
    title: "Choose a question set",
    instruction: "Select General admission.",
    explanationTitle: "What a workup does",
    explanation: "A workup is a reusable set of history and physical-exam questions. Selecting it does not make a checklist until you explicitly build one."
  },
  "build-checklist": {
    view: "workups",
    targetSelector: '.workup-editor-header-actions [data-action="build-checklist"]',
    title: "Build the checklist",
    instruction: "Click Build checklist.",
    helper: ""
  },
  "answer-checklist": {
    view: "checklist",
    targetSelector: '#checklistSections > .checklist-section:first-child .checklist-item:first-child .checklist-answer',
    title: "Answer a checklist question",
    instruction: "Choose an answer for the highlighted question.",
    explanationTitle: "Why answer the checklist",
    explanation: "Your documented history and examination findings become concise, selected-day evidence for the next prompt."
  },
  "open-prompts": {
    view: "prompts",
    navTarget: "prompts",
    title: "Open the prompt builder",
    instruction: "Click OpenEvidence Prompts in the sidebar.",
    helper: ""
  },
  "copy-prompt": {
    view: "prompts",
    targetSelector: '[data-action="copy-prompt"]',
    title: "Copy the prompt",
    instruction: "Click Copy prompt.",
    explanationTitle: "What you are copying",
    explanation: "The app assembles de-identified, labeled context into a prompt. You can edit the template before copying it; it does not generate or store an external result."
  },
  "open-teaching": {
    view: "prompts",
    targetSelector: "#promptTaskSelect",
    title: "Open the teaching showcase",
    instruction: "Choose Teaching: full case trajectory from the prompt list.",
    helper: ""
  },
  "teaching-showcase": {
    view: "prompts",
    targetSelector: "#promptOutputHighlighted",
    title: "See the case teaching explanation",
    instruction: "Review the teaching prompt, then click Copy prompt to finish the demo.",
    explanationTitle: "How the teaching prompt is different",
    explanation: "This prompt turns the reviewed admission context, hospital-day update, and checklist findings into a case-based explanation for a clinician in training. It emphasizes clinical reasoning and the meaning of key decisions."
  },
  done: {
    view: "prompts",
    title: "Demo complete",
    instruction: "You followed the full sample workflow.",
    explanationTitle: "You completed the workflow",
    explanation: "You reviewed de-identification, built a checklist, created a progress-note prompt, and previewed the teaching-case prompt. Nothing from the synthetic case was written to your vault."
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
          ${!routeMismatch && stage.explanation ? `<aside class="guided-demo-explainer"><strong>${escapeHtml(stage.explanationTitle || "What this step does")}</strong><span>${escapeHtml(stage.explanation)}</span></aside>` : ""}
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
