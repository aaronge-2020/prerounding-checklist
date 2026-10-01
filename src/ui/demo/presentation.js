import { DEMO_CONTEXT_TEXTS } from "./session.js?v=20261001-demo-v4";

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
    instruction: "We pasted the full sample admission note for you — heading detection sorted it into sections instantly: one-liner, chief complaint, HPI, histories, meds, exam, labs, assessment, and plan. With a local AI model loaded, “Parse with local AI” sorts it into verified sections instead. Press Continue.",
    calloutTitle: "Note parsing, two speeds",
    callout: "The deterministic parser finds headings like HPI, Medications, and Assessment and Plan the moment text is pasted — no model needed, and the section list on the note shows everything it found. Load an on-device model and the Parse with local AI button appears here, sorting the note into verified verbatim sections for de-identification and prompts."
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
    title: "A grounded answer, staged for the tour",
    instruction: "Below is the sample question and answer — notice how it cites the patient's documents and the literature. Press Continue to move on.",
    calloutTitle: "Grounded twice over",
    callout: "The sample answer cites Daniel's own chart (troponin trend, ECG, admission note) and the clinical literature (Fourth Universal Definition of MI). Live answers carry the same citations, and the Context inspector still controls exactly what the chat may see.",
    demoSample: {
      kind: "ai-chat",
      label: "Sample Q&A"
    }
  },
  "open-scribe-pro": {
    view: "scribePro",
    info: true,
    title: "Meet the voice scribe",
    instruction: "Scribe Pro transcribes dictation on-device and drafts the note. Below is a sample of its output — the tour starts nothing. Press Continue.",
    calloutTitle: "Nothing recorded in this tour",
    callout: "This tour does not start the engine: no model download, no microphone access, nothing recorded. On your own machine, download the models once, then press Record to dictate.",
    demoSample: {
      kind: "transcript",
      label: "Sample dictation"
    }
  },
  "scribe-pro-voice": {
    view: "scribePro",
    info: true,
    title: "From dictation to draft note",
    instruction: "The same sample, structured into note sections — this is the format Scribe Pro produces. Press Continue.",
    calloutTitle: "Sample output, not a live run",
    callout: "What you see below was staged for the demo. In live use, the transcript comes from the on-device Parakeet model and the note sections are drafted from that transcript.",
    demoSample: {
      kind: "note",
      label: "Sample structured note"
    }
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
    info: true,
    targetSelector: '[data-cheat-sheets-open="acute-coronary-syndrome"]',
    sheetId: "acute-coronary-syndrome",
    title: "Open the ACS cheat sheet",
    instruction: "The Acute coronary syndrome / NSTEMI/STEMI sheet is open below — scan the history questions and exam maneuvers. Opening it attached the sample case's vitals, labs, ECG, echo, and medications to the hospital day. Press Continue.",
    helper: "Cheat sheets are read-only — no patient is needed.",
    calloutTitle: "Scan the bedside approach",
    callout: "The ACS sheet lists the history questions to ask and the maneuvers to perform, with why each one matters. The sample objective data is now attached to the hospital day, so the note-writing step has what it needs."
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
    info: true,
    targetSelector: '[data-action="save-note-draft"]',
    title: "Review the complete case note",
    instruction: "Review the complete synthetic case note: the parsed one-liner, subjective, and exam; objective vitals, labs, and medications; and the full assessment and problem-oriented plan. Make any edits you want, then press Continue.",
    helper: "The synthetic tutorial keeps this saved note only for the temporary demo session.",
    calloutTitle: "Review before asking for feedback",
    callout: "The draft note is the parsed sample case, not a stub: the admission note's one-liner, subjective, and exam, the day-one update, objective vitals, labs, and medications, plus a complete assessment and plan. Saving keeps the draft local; press Continue when you are done reviewing."
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
  "open-scribe-pro": "scribe-pro-voice",
  "scribe-pro-voice": "open-cheat-sheets",
  "browse-cheat-sheet": "open-review",
  "write-note": "open-prompts"
});

// The parse-note stop pastes the same complete admission note the tour's
// first steps de-identify, so the parser showcase runs on the full synthetic
// case: one-liner, chief complaint, HPI, histories, meds, exam, labs,
// assessment, and plan.
export const DEMO_PARSE_NOTE_TEXT = DEMO_CONTEXT_TEXTS.join("\n\n");

export const DEMO_DRUG_CHECK_MEDS = "warfarin 5 mg PO daily\nfluconazole 200 mg PO daily\n";

// Pre-built AI Chat exchange staged by the demo. The question is what a
// clinician would ask; the answer cites the demo patient's own documents
// (admission note, labs, ECG) and the clinical literature, demonstrating the
// grounded-answer format without running a live model.
export const DEMO_AI_CHAT_QUESTION = "Does this patient meet criteria for NSTEMI, and what supports it?";

export const DEMO_AI_CHAT_ANSWER = [
  "Yes — this presentation meets criteria for NSTEMI.",
  "",
  "From the chart:",
  "• Typical ischemic symptoms: 6 hours of crushing substernal pressure (8/10) beginning with exertion, radiating to the left arm, neck, and jaw, with diaphoresis [admission note].",
  "• Acute myocardial injury with a rise and fall: high-sensitivity troponin 86 → 364 → 312 ng/L (ref 0–19) [labs].",
  "• Ischemic ECG changes without ST elevation: persistent 1 mm ST depressions in V4–V6 with T-wave inversions in I and aVL [ECG].",
  "",
  "From the literature:",
  "• The Fourth Universal Definition of MI requires a troponin rise and/or fall plus at least one of: ischemic symptoms, new ischemic ECG changes, new Q waves, imaging evidence, or angiographic thrombus. This patient has the troponin pattern plus both symptoms and ECG changes.",
  "• Without ST elevation this is NSTEMI rather than STEMI. ACC/AHA guidance supports an early invasive strategy here — coronary angiography is already planned — with dual antiplatelet therapy, therapeutic anticoagulation, and high-intensity statin. The chart shows aspirin, ticagrelor, heparin infusion, and atorvastatin 80 mg already on board [medications].",
  "",
  "Sample answer staged for the demo — not a live model response."
].join("\n");

// Combined Q&A for the tour banner sample (Issue 1 fix: staged answer must be
// visible in the banner itself, since the dim overlay blocks chat interaction).
export const DEMO_AI_CHAT_QA = [
  "Q: " + DEMO_AI_CHAT_QUESTION,
  "",
  DEMO_AI_CHAT_ANSWER
].join("\n");

// Pre-built Scribe Pro sample staged by the demo: a short dictation snippet
// and the structured note it produces, showing the output format without
// starting the engine, downloading models, or touching the microphone.
export const DEMO_SCRIBE_TRANSCRIPT = [
  "Sixty-one-year-old man, known coronary disease with a LAD stent in 2022,",
  "here with three days of worsening exertional chest pressure — substernal,",
  "radiating to the left arm. Troponin peaked at 364 and is downtrending, now",
  "312. ECG shows persistent lateral ST depressions, no ST elevation. Echo: EF",
  "48 percent with anterior wall hypokinesis. Assessment is NSTEMI. Plan:",
  "continue heparin infusion, aspirin and ticagrelor, high-intensity statin,",
  "cardiology for cath today, NPO after midnight."
].join("\n");

export const DEMO_SCRIBE_NOTE = [
  "HISTORY OF PRESENT ILLNESS",
  "61-year-old man with known CAD s/p LAD drug-eluting stent (2022) presenting",
  "with 3 days of worsening exertional substernal chest pressure radiating to",
  "the left arm.",
  "",
  "OBJECTIVE",
  "• Vitals (most recent): BP 128/76, HR 82, SpO2 97%",
  "• Labs: hs-troponin 86 → 364 → 312 ng/L (ref 0–19); creatinine stable at 1.0",
  "• ECG: sinus rhythm, persistent 1 mm ST depressions V4–V6, T-wave inversions",
  "  I/aVL, no ST elevation",
  "• Echo: LVEF 48% with mild anterior-wall hypokinesis",
  "",
  "ASSESSMENT AND PLAN",
  "NSTEMI, high risk. Continue therapeutic heparin, dual antiplatelet therapy",
  "(aspirin 81 mg + ticagrelor 90 mg BID), atorvastatin 80 mg. Early invasive",
  "coronary angiography today; NPO after midnight. Telemetry with serial ECGs."
].join("\n");

export function demoStage(stageId) {
  return DEMO_GUIDE_STAGES[stageId] || DEMO_GUIDE_STAGES["save-context"];
}

export function createDemoPresentation({ escapeHtml }) {
  function renderSample(stage) {
    const sample = stage.demoSample;
    if (!sample) return "";
    const text = sample.kind === "note" ? DEMO_SCRIBE_NOTE : sample.kind === "ai-chat" ? DEMO_AI_CHAT_QA : DEMO_SCRIBE_TRANSCRIPT;
    return `
      <details class="guided-demo-sample" data-demo-sample>
        <summary><span class="guided-demo-badge">Sample</span> ${escapeHtml(sample.label)} — staged for the demo, not a live run</summary>
        <pre style="white-space:pre-wrap;font:inherit;margin:8px 0 0;padding:10px 12px;border:1px solid var(--border,#d8dee9);border-radius:8px;background:var(--surface,#f8fafc);">${escapeHtml(text)}</pre>
      </details>
    `;
  }

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
          ${renderSample(stage)}
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
