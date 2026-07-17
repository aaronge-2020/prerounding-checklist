export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": {
    view: "daily",
    targetSelector: '[data-action="save-context"]',
    title: "Save the synthetic admission packet",
    what: "Save the preloaded synthetic admission packet.",
    why: "This runs the same local de-identification path used for a note, without using real patient data.",
    instruction: "Click Save admission packet. The app will create a local review draft."
  },
  "context-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Review the admission redactions",
    what: "Review the highlighted replacements one field at a time. Confirm safe replacements, reject incorrect ones, and continue through quiet fields.",
    why: "The model only drafts redactions; a person must verify the draft before text can be copied to an external evidence tool.",
    instruction: "Use Confirm rest for the current field, then Continue to next field when that field is complete."
  },
  "save-day": {
    view: "daily",
    targetSelector: '[data-action="save-day"]',
    title: "Save the hospital-day update",
    what: "Save the preloaded HD1 hospital-day update.",
    why: "Admission context and daily updates are separate packets, so each update can be reviewed without changing the saved timeline.",
    instruction: "Click Save hospital day to run local de-identification on the HD1 update."
  },
  "daily-review": {
    view: "daily",
    targetSelector: '[data-action="confirm-all-section-redactions"]',
    title: "Review the hospital-day redactions",
    what: "Review the detected date and identifier replacements in the HD1 update.",
    why: "Every saved packet gets its own human review; earlier decisions are not silently applied to later notes.",
    instruction: "Use Confirm rest for the current field, then continue until the daily update is complete."
  },
  "open-workups": {
    view: "workups",
    navTarget: "workups",
    title: "Open Workups",
    what: "Open Workups from the sidebar.",
    why: "A workup turns a clinical concern into explicit history and physical-exam questions; nothing is added automatically.",
    instruction: "Click the highlighted Workups control."
  },
  "select-workup": {
    view: "workups",
    targetSelector: '.workup-checkbox[value="general-admission"]',
    title: "Choose a workup",
    what: "Select General admission from the real workup catalog.",
    why: "Checklist content is chosen explicitly, so the learner can see exactly which questions will be included.",
    instruction: "Select the highlighted General admission option."
  },
  "build-checklist": {
    view: "workups",
    targetSelector: '.workup-editor-header-actions [data-action="build-checklist"]',
    title: "Build the checklist",
    what: "Build a checklist from the selected workup.",
    why: "Selecting a workup does not change the checklist by itself; building it is an explicit step the learner controls.",
    instruction: "Click Build checklist after selecting the workup."
  },
  "answer-checklist": {
    view: "checklist",
    targetSelector: '#checklistSections > .checklist-section:first-child .checklist-item:first-child .checklist-answer',
    title: "Answer a checklist question",
    what: "Choose an answer in the real checklist.",
    why: "The checklist captures the learner's current assessment before an evidence question is drafted.",
    instruction: "Choose any answer in the highlighted checklist item. The demo will then point you to the evidence prompt."
  },
  "open-prompts": {
    view: "prompts",
    navTarget: "prompts",
    title: "Open OpenEvidence Prompts",
    what: "Open the prompt builder from the sidebar.",
    why: "The prompt is built from the reviewed, de-identified workflow rather than from raw patient text.",
    instruction: "Click the highlighted OpenEvidence Prompts control."
  },
  "copy-prompt": {
    view: "prompts",
    targetSelector: '[data-action="copy-prompt"]',
    title: "Copy the de-identified prompt",
    what: "Copy the generated de-identified evidence prompt.",
    why: "Only the reviewed prompt is copied; the demo never sends raw note text to an external service.",
    instruction: "Click Copy prompt."
  },
  done: {
    view: "prompts",
    title: "Demo complete",
    what: "You followed the real path from a synthetic note to a reviewed checklist and evidence prompt.",
    why: "This demonstrates the intended boundary: local processing and human review before external evidence lookup.",
    instruction: "Nothing from this demo was written to your vault."
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
        <div class="guided-demo-step">Guided demo · ${isComplete ? "Complete" : `Step ${step} of ${stageIds.length - 1}`}</div>
        <div class="guided-demo-copy">
          <strong>${escapeHtml(stage.title)}</strong>
          <div class="guided-demo-instructions">
            <span><b>What:</b> ${escapeHtml(stage.what || stage.instruction)}</span>
            <span><b>Why:</b> ${escapeHtml(stage.why || "This keeps the demo on the same path as the real app.")}</span>
            <span class="guided-demo-next"><b>Next:</b> ${escapeHtml(nextInstruction)}</span>
          </div>
        </div>
        <span class="guided-demo-badge">Synthetic only</span>
        <button class="button--quiet" type="button" data-action="restart-guided-demo">Restart demo</button>
      </section>
    `;
  }

  return { renderGuide, stageFor: demoStage };
}
