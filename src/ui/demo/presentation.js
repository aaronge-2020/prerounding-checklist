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
    targetSelector: '[data-action="keep-reviewed-redaction"]',
    title: "Check the highlighted changes",
    instruction: "Review the current highlighted change, then click Accept. Continue one change at a time, or use Confirm rest when the remaining suggestions are correct.",
    calloutTitle: "What you are reviewing",
    callout: "Crossed-out text is a possible identifier. The label beside it is the replacement. Accept moves to the next suggestion without losing your place; Confirm rest accepts every remaining suggestion in the field."
  },
  "save-day": {
    view: "daily",
    targetSelector: '[data-action="add-daily-source"]',
    title: "Add the day-one update",
    instruction: "Click De-identify and add source.",
    calloutTitle: "Add today’s update",
    callout: "This second note contains Daniel’s hospital-day update. Add it separately so later prompts can distinguish what brought him in from what changed today."
  },
  "daily-review": {
    view: "daily",
    targetSelector: '[data-action="keep-reviewed-redaction"]',
    title: "Check the day-one changes",
    instruction: "Accept the current highlighted change, then continue through the fields. Use Confirm rest only when the remaining suggestions are correct.",
    calloutTitle: "Review this update separately",
    callout: "The same review process applies to each hospital day. Keeping this update separate lets a progress-note prompt focus on today’s clinical decisions."
  },
  "open-workups": {
    view: "workups",
    navTarget: "workups",
    title: "Choose checklist questions",
    instruction: "Click Workups in the sidebar.",
    calloutTitle: "Next: build a focused checklist",
    callout: "Workups are reusable sets of history and examination questions. You will select one, then turn it into a checklist for this case."
  },
  "select-workup": {
    view: "workups",
    targetSelector: '.workup-checkbox[value="nstemi-prerounds"]',
    title: "Choose a question set",
    instruction: "Select NSTEMI pre-rounds.",
    calloutTitle: "Select a workup",
    callout: "This focused workup pairs ACS-specific history questions with bedside maneuvers for recurrent ischemia, heart failure, arrhythmia, bleeding, perfusion, important alternatives, and readiness for angiography."
  },
  "build-checklist": {
    view: "workups",
    targetSelector: '.workup-editor-header-actions [data-action="build-checklist"]',
    title: "Build the checklist",
    instruction: "Click Build checklist.",
    calloutTitle: "Create the checklist",
    callout: "Build checklist turns the selected question set into an editable bedside checklist for this hospital day."
  },
  "answer-checklist": {
    view: "checklist",
    targetSelector: '.checklist-answer[name="nstemi-prerounds:chest-pain-now"]',
    title: "Ask one bedside question",
    instruction: "Record that Daniel has no chest discomfort now.",
    helper: "All other history and examination findings are pre-filled for this sample case.",
    calloutTitle: "Complete the one open finding",
    callout: "The other history and examination findings are pre-filled to keep the walkthrough focused. Confirming whether chest pain is present now completes bedside data collection before you begin writing the note."
  },
  "open-review": {
    view: "review",
    navTarget: "review",
    title: "Write after bedside data collection",
    instruction: "Click Review Data / Draft Note in the sidebar.",
    calloutTitle: "Next: write the note",
    callout: "History questions and physical-exam maneuvers come first. Every completed answer is already placed in Subjective or Physical Exam, using only the chart-ready answer rather than the bedside question."
  },
  "write-note": {
    view: "review",
    targetSelector: "[data-draft-assessment]",
    title: "Write your clinical assessment",
    instruction: "Write a short assessment in your own words.",
    helper: "Your checklist findings and assessment will become the student note sent for feedback.",
    calloutTitle: "The student writes first",
    callout: "The app organizes evidence, but it does not invent your reasoning. Write your synthesis here before asking an external tool to edit or verify the note."
  },
  "save-note": {
    view: "review",
    targetSelector: '[data-action="save-note-draft"]',
    title: "Save the encrypted draft",
    instruction: "Click Save encrypted draft.",
    helper: "The synthetic tutorial keeps this saved note only for the temporary demo session.",
    calloutTitle: "Keep the draft local",
    callout: "Saving encrypts the note in the local vault without running a de-identification model. Unsaved note text is never inserted automatically into an external-tool prompt."
  },
  "open-prompts": {
    view: "prompts",
    navTarget: "prompts",
    title: "Open the prompt builder",
    instruction: "Click Prompts in the sidebar.",
    calloutTitle: "Get feedback on the note you wrote",
    callout: "Edit and verify presentation is the default prompt. Your student note is populated automatically so you can send it to OpenEvidence or Doximity for feedback after completing the bedside work and your own draft."
  },
  "copy-prompt": {
    view: "prompts",
    targetSelector: '[data-action="copy-prompt"]',
    title: "Copy the prompt",
    instruction: "Click Copy prompt.",
    calloutTitle: "Copy the prepared prompt",
    callout: "The copied prompt contains your draft note plus the edit-and-verify instructions. Confirm the draft has no identifiers before pasting it into OpenEvidence or Doximity; the app does not send it automatically or save the external response."
  },
  done: {
    view: "prompts",
    title: "Demo complete",
    instruction: "You followed the full sample workflow.",
    helper: "You gathered history and exam findings, wrote and encrypted a student note, and prepared it for external feedback. Nothing from this demo was written to your vault."
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
      ? `The previous field is complete. Click Continue to next field to review ${nextSectionLabel || "the next field"}. You check the app's suggestions before moving on.`
      : "";
    const nextInstruction = routeMismatch
      ? `Open ${stage.view === "workups" ? "Workups" : stage.view === "prompts" ? "Prompts" : stage.view} with the highlighted sidebar control to continue.`
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
