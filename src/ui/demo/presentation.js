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
    instruction: "Review the current highlighted change, then click Accept. Continue one change at a time, or use Confirm all when the remaining suggestions are correct.",
    calloutTitle: "What you are reviewing",
    callout: "Crossed-out text is a possible identifier. The label beside it is the replacement. Accept moves to the next suggestion without losing your place; Confirm all accepts every remaining suggestion in the field."
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
    instruction: "Accept the current highlighted change, then continue through the fields. Use Confirm all only when the remaining suggestions are correct.",
    calloutTitle: "Review this update separately",
    callout: "The same review process applies to each hospital day. Keeping this update separate lets a progress-note prompt focus on today’s clinical decisions."
  },
  "parse-note": {
    view: "daily",
    info: true,
    targetSelector: '[data-structured-note-detected="admission"]',
    title: "Paste a note, get sections",
    instruction: "We pasted a sample admission note for you — heading detection sorted it into sections instantly. With a local AI model loaded, “Parse with local AI” sorts it into verified sections instead. Press Continue.",
    calloutTitle: "Note parsing, two speeds",
    callout: "The deterministic parser finds headings like HPI, Medications, and Assessment and Plan the moment text is pasted — no model needed. Load an on-device model and the Parse with local AI button appears here, sorting the note into verified verbatim sections for de-identification and prompts."
  },
  "open-drug-checks": {
    view: "drugChecks",
    navTarget: "drugChecks",
    title: "Check drug interactions",
    instruction: "Click Drug checks in the sidebar.",
    calloutTitle: "Next: the on-device drug database",
    callout: "Drug checks runs fully on-device. RxNorm resolves the names you type to ingredient codes, and the bundled DDInter 2.0 database checks every pair — no drug names ever leave your browser."
  },
  "check-interactions": {
    view: "drugChecks",
    targetSelector: '[data-action="drug-checks-check"]',
    title: "Run the interaction check",
    instruction: "We filled in warfarin and fluconazole. Click Check interactions.",
    calloutTitle: "A Major interaction, found locally",
    callout: "The checker resolves both drugs to RxNorm ingredients and looks up every pair in the bundled database — 210,360 interaction pairs shipped with the app. Warfarin + fluconazole is Major: fluconazole inhibits warfarin metabolism and raises bleeding risk."
  },
  "open-ai-chat": {
    view: "aiChat",
    navTarget: "aiChat",
    title: "Open AI Chat",
    instruction: "Click AI Chat in the sidebar.",
    calloutTitle: "Next: chat with the chart",
    callout: "AI Chat answers from the current patient’s de-identified data — either with an on-device model or ChatGPT. Only what you select in the Context inspector is ever sent anywhere."
  },
  "ai-chat-models": {
    view: "aiChat",
    info: true,
    targetSelector: '[data-action="ai-chat-mode"][data-mode="local"]',
    title: "On-device or ChatGPT",
    instruction: "Pick On-device to download a model into your browser, or ChatGPT to use OpenAI with automatic de-identification. Press Continue when you have seen the options.",
    calloutTitle: "Two engines, one rule",
    callout: "On-device keeps everything in this browser. ChatGPT mode automatically downloads the clinical redaction model and strips identifiers before anything is sent — and it only ever sends what you select in the Context inspector."
  },
  "ai-chat-ask": {
    view: "aiChat",
    info: true,
    targetSelector: '[data-action="ai-chat-context-inspector"]',
    title: "You control the context",
    instruction: "The Context button opens the inspector: tick exactly the pieces the chat may see, then type below and Send. Press Continue to move on.",
    calloutTitle: "Only send what you select",
    callout: "Nothing is sent implicitly. The inspector lists the available de-identified pieces — admission note, day updates, labs — and the chat sees only what you tick. That selection rule holds in both On-device and ChatGPT modes."
  },
  "open-scribe-pro": {
    view: "scribePro",
    navTarget: "scribePro",
    title: "Open the voice scribe",
    instruction: "Click Scribe Pro in the sidebar.",
    calloutTitle: "Dictate instead of typing",
    callout: "Scribe Pro is the voice scribe: it transcribes speech on-device with the Parakeet model, so nothing you say is uploaded. Opening it never starts a recording on its own."
  },
  "scribe-pro-voice": {
    view: "scribePro",
    info: true,
    targetSelector: "#btnRecord",
    title: "Voice scribe, on-device",
    instruction: "The Record button starts transcription once the engine is ready. Press Continue when you have seen it.",
    calloutTitle: "Nothing recorded in this tour",
    callout: "This tour does not start the engine: no model download, no microphone access, nothing recorded. On your own machine, download the models once, then press Record to dictate."
  },
  "open-cheat-sheets": {
    view: "cheatSheets",
    navTarget: "cheatSheets",
    title: "Open the bedside cheat sheets",
    instruction: "Click Cheat Sheets in the sidebar.",
    calloutTitle: "Next: look up the bedside approach",
    callout: "Cheat sheets are read-only pocket references distilled from the old bedside question sets. Search by complaint to pull up focused history questions and physical-exam maneuvers before you see the patient."
  },
  "browse-cheat-sheet": {
    view: "cheatSheets",
    targetSelector: '[data-cheat-sheets-open="acute-coronary-syndrome"]',
    title: "Open the ACS cheat sheet",
    instruction: "Click the Acute coronary syndrome / NSTEMI/STEMI sheet.",
    helper: "Cheat sheets are read-only — no patient is needed.",
    calloutTitle: "Scan the bedside approach",
    callout: "The ACS sheet lists the history questions to ask and the maneuvers to perform, with why each one matters. Opening it attaches the sample case's vitals, labs, ECG, echo, and medications to the hospital day, so the note-writing step has objective data."
  },
  "open-review": {
    view: "review",
    navTarget: "review",
    title: "Write after bedside review",
    instruction: "Click Review Data / Draft Note in the sidebar.",
    calloutTitle: "Next: write the note",
    callout: "Bedside preparation comes first. The cheat sheet showed you what to ask and examine; the sample objective data is now attached to the hospital day, and your synthetic assessment and plan are pre-filled for review."
  },
  "write-note": {
    view: "review",
    targetSelector: '[data-action="save-note-draft"]',
    title: "Review the complete assessment and plan",
    instruction: "Review the fully written synthetic assessment and problem-oriented plan, make any edits you want, then click Save encrypted draft.",
    helper: "The synthetic tutorial keeps this saved note only for the temporary demo session.",
    calloutTitle: "Review before asking for feedback",
    callout: "The demo supplies complete synthetic clinical reasoning so you can inspect the whole note. Saving keeps the draft local and advances only when you explicitly click the button; typing alone never moves the walkthrough forward."
  },
  "open-prompts": {
    view: "prompts",
    navTarget: "prompts",
    title: "Open the prompt builder",
    instruction: "Click Prompts in the sidebar.",
    calloutTitle: "Get feedback on the note you wrote",
    callout: "Coach and verify presentation is the default prompt. Your student note is populated automatically so you can send it to OpenEvidence or Doximity for guided feedback after completing the bedside work and your own draft."
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
    helper: "You de-identified the source notes, parsed a pasted note, checked a drug interaction, toured AI Chat, met the voice scribe, reviewed a bedside cheat sheet, wrote and encrypted a student note, and prepared it for external feedback. Nothing from this demo was written to your vault."
  }
});

// Info stages explain a feature and advance with an explicit Continue button;
// action stages advance only when the user performs the highlighted action.
export const DEMO_INFO_STAGES = Object.freeze(
  new Set(Object.entries(DEMO_GUIDE_STAGES).filter(([, stage]) => stage.info).map(([id]) => id))
);

// Explicit stage order for Continue-button advancement on info stages.
export const DEMO_STAGE_NEXT = Object.freeze({
  "parse-note": "open-drug-checks",
  "ai-chat-models": "ai-chat-ask",
  "ai-chat-ask": "open-scribe-pro",
  "scribe-pro-voice": "open-cheat-sheets"
});

// Prefill text staged by the demo controller when entering feature stops.
export const DEMO_PARSE_NOTE_TEXT = [
  "HISTORY OF PRESENT ILLNESS:",
  "Daniel Morgan is a 61-year-old man with coronary artery disease who presents with worsening exertional chest pain and shortness of breath for 3 days. Pain is substernal, pressure-like, radiates to the left arm.",
  "",
  "PAST MEDICAL HISTORY:",
  "Coronary artery disease, hypertension, hyperlipidemia.",
  "",
  "MEDICATIONS:",
  "Aspirin 81 mg daily, atorvastatin 80 mg daily, metoprolol 50 mg twice daily.",
  "",
  "PHYSICAL EXAM:",
  "BP 148/92, HR 96, RR 18, SpO2 96% on room air. Lungs clear. No peripheral edema.",
  "",
  "ASSESSMENT AND PLAN:",
  "NSTEMI — start heparin infusion, cardiology consult for cath."
].join("\n");

export const DEMO_DRUG_CHECK_MEDS = "warfarin 5 mg PO daily\nfluconazole 200 mg PO daily\n";

export function demoStage(stageId) {
  return DEMO_GUIDE_STAGES[stageId] || DEMO_GUIDE_STAGES["save-context"];
}

export function createDemoPresentation({ escapeHtml }) {
  function renderGuide({ session, currentView, reviewAction = "", nextSectionLabel = "" }) {
    const stage = demoStage(session.stage);
    const stageIds = Object.keys(DEMO_GUIDE_STAGES);
    const step = Math.max(1, stageIds.indexOf(session.stage) + 1);
    const isComplete = session.stage === "done";
    const isInfo = DEMO_INFO_STAGES.has(session.stage);
    const routeMismatch = !isComplete && currentView !== stage.view;
    const reviewHandoff = reviewAction === "continue-section-review"
      ? `The previous field is complete. Click Continue to next field to review ${nextSectionLabel || "the next field"}. You check the app's suggestions before moving on.`
      : "";
    const nextInstruction = routeMismatch
      ? `Open ${stage.view === "cheatSheets" ? "Cheat Sheets" : stage.view === "prompts" ? "Prompts" : stage.view === "drugChecks" ? "Drug checks" : stage.view === "aiChat" ? "AI Chat" : stage.view} with the highlighted sidebar control to continue.`
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
            <span class="guided-demo-hint" data-demo-hint hidden>Click the highlighted control to continue the tour.</span>
          </div>
        </div>
        <div class="guided-demo-actions">
          <span class="guided-demo-badge">Synthetic sample</span>
          ${!isComplete && isInfo ? `<button class="button--primary guided-demo-continue" type="button" data-action="advance-guided-demo">Continue</button>` : ""}
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
