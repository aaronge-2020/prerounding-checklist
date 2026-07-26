export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": {
    view: "daily",
    targetSelector: '[data-action="add-admission-source"]',
    title: "Start with the sample case",
    instruction: "Click De-identify and add source.",
    calloutTitle: "Meet the sample patient",
    callout: "Daniel Morgan is a synthetic 61-year-old man with coronary artery disease, admitted with worsening chest pain and shortness of breath concerning for NSTEMI. The note includes realistic sample identifiers. The selected local model scans this source in your browser, proposes replacements, and asks for your review before saving."
  },
  "context-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the highlighted changes",
    instruction: "Review the highlighted changes, then click Confirm rest."
  },
  "save-day": {
    view: "daily",
    targetSelector: '[data-action="add-daily-source"]',
    title: "Add the day-one update",
    instruction: "Click De-identify and add source."
  },
  "daily-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Check the day-one changes",
    instruction: "Review the highlighted changes, then continue through the fields."
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
    instruction: "Select General admission."
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
    instruction: "Choose an answer for the highlighted question."
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
    instruction: "Click Copy prompt."
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
    instruction: "Review the teaching prompt, then click Copy prompt to finish the demo."
  },
  done: {
    view: "prompts",
    title: "Demo complete",
    instruction: "You followed the full sample workflow.",
    helper: "You reviewed the sample case, created a prompt, and reached the teaching showcase."
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

  function renderCallout({ stage }) {
    if (!stage.callout) return "";
    return `
      <aside class="guided-demo-callout" data-demo-callout role="note">
        <strong>${escapeHtml(stage.calloutTitle || "About this step")}</strong>
        <p>${escapeHtml(stage.callout)}</p>
      </aside>
    `;
  }

  return { renderGuide, renderCallout, stageFor: demoStage };
}
