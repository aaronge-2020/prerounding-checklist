import { DEMO_CONTEXT_TEXTS } from "./session.js?v=20261001-demo-v4";

export const DEMO_GUIDE_STAGES = Object.freeze({
  "save-context": {
    view: "daily",
    targetSelector: '[data-action="add-admission-source"]',
    title: "Start with the sample case",
    instruction: "Click De-identify and add source.",
    calloutTitle: "The rule for everything here",
    callout: "Daniel Morgan is a synthetic 61-year-old man with coronary artery disease, admitted with worsening chest pain concerning for NSTEMI. The note includes realistic sample identifiers. Here is the rule you will follow for the entire workflow: de-identify first, work second. The local model scans this source in your browser, proposes replacements, and asks for your review before anything is saved."
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
    instruction: "Accept the highlighted change, then press Continue. Use Confirm all only when the remaining suggestions are correct.",
    calloutTitle: "Review this update separately",
    callout: "The same review process applies to each hospital day. Keeping this update separate lets a progress-note prompt focus on today’s clinical decisions."
  },
  "parse-note": {
    view: "daily",
    targetSelector: '[data-action="review-structured-note-sections"][data-note-scope="admission"]',
    title: "Paste a note, get sections",
    instruction: "We pasted the full sample admission note — heading detection sorted it into sections instantly. Click Review sections to inspect what the parser found.",
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
    targetSelector: '[data-action="ai-chat-mode"][data-mode="local"]',
    title: "On-device or ChatGPT",
    instruction: "Click On-device to see the local model options. Everything stays in your browser — or switch to ChatGPT for OpenAI with automatic de-identification.",
    calloutTitle: "Two engines, one rule",
    callout: "On-device keeps everything in this browser. ChatGPT mode automatically downloads the clinical redaction model and strips identifiers before anything is sent — and it only ever sends what you select in the Context inspector."
  },
  "ai-chat-ask": {
    view: "aiChat",
    targetSelector: '[data-action="ai-chat-send"]',
    title: "Ask your own question",
    instruction: "We filled in a question for you — click Send (or type your own question first). You will get a staged answer that cites the chart and the literature, no model needed.",
    calloutTitle: "Grounded twice over",
    callout: "The sample answers cite Daniel's own chart (troponin trend, ECG, admission note) and the clinical literature (Fourth Universal Definition of MI). Live answers carry the same citations, and the Context inspector still controls exactly what the chat may see."
  },
  "ai-chat-read": {
    view: "aiChat",
    info: true,
    targetSelector: '[data-ai-chat-messages]',
    title: "A grounded answer",
    instruction: "Read the staged answer — notice how it cites the patient's documents and the literature. Every live answer works the same way. Press Continue.",
    calloutTitle: "You control the context",
    callout: "The Context inspector decides exactly what the chat may see. In ChatGPT mode, everything is de-identified before it leaves your browser — you approve exactly what gets sent."
  },
  "open-scribe-pro": {
    view: "scribePro",
    info: true,
    targetSelector: '#btnRecord',
    title: "Meet the voice scribe",
    instruction: "Scribe Pro transcribes dictation on-device and drafts the note. The highlighted Record button is where you start — below is a sample of its output. The tour starts nothing. Press Continue.",
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
    targetSelector: '#transcriptList',
    title: "From dictation to draft note",
    instruction: "The highlighted transcript area is where your dictation appears — the same sample, structured into note sections, is the format Scribe Pro produces. Press Continue.",
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
    targetSelector: '[data-draft-section="one_liner"]',
    title: "Make the note yours",
    instruction: "Click the highlighted one-liner and type — add your initials, tweak the wording, make it yours. This is your note to edit.",
    helper: "The synthetic tutorial keeps this saved note only for the temporary demo session.",
    calloutTitle: "Review before asking for feedback",
    callout: "The draft note is the parsed sample case, not a stub: the admission note's one-liner, subjective, and exam, the day-one update, objective vitals, labs, and medications, plus a complete assessment and plan. Edit it freely — saving keeps the draft local."
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
    title: "You know the workflow",
    instruction: "You did every step yourself. Here is what you can now do on a real case.",
    helper: "You can now: De-identify a note and review every redaction before saving. Parse a pasted note into sections. Check drug interactions. Ask the AI Chat a question and read a cited answer. Dictate with Scribe Pro. Pull up a bedside cheat sheet. Edit your draft note. Build a de-identified prompt for feedback. The rule held throughout: de-identify first, work second. Nothing from this demo was written to your vault. Click Exit demo, then try it with your own case.",
    calloutTitle: "Try it yourself",
    callout: "Exit the demo and run the same workflow: add your own admission note, de-identify it, parse it, check interactions, and draft your note. The Models page has the local AI models when you are ready."
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
  "ai-chat-read": "open-scribe-pro",
  "open-scribe-pro": "scribe-pro-voice",
  "scribe-pro-voice": "open-cheat-sheets",
  "browse-cheat-sheet": "open-review"
});

// The parse-note stop pastes the same complete admission note the tour's
// first steps de-identify, so the parser showcase runs on the full synthetic
// case: one-liner, chief complaint, HPI, histories, meds, exam, labs,
// assessment, and plan.
export const DEMO_PARSE_NOTE_TEXT = DEMO_CONTEXT_TEXTS.join("\n\n");

export const DEMO_DRUG_CHECK_MEDS = "warfarin 5 mg PO daily\nfluconazole 200 mg PO daily\n";

// Pre-built AI Chat exchanges staged by the demo. Each question is what a
// clinician would ask; each answer cites the demo patient's own documents
// (admission note, labs, ECG) and the clinical literature, demonstrating the
// grounded-answer format without running a live model. Seeded into the actual
// AI Chat UI (with markdown rendering) — not plain text in the guide banner.
export const DEMO_AI_CHAT_SAMPLES = [
  {
    question: "Does this patient meet criteria for NSTEMI, and what supports it?",
    answer: [
      "Yes — this presentation meets criteria for NSTEMI.",
      "",
      "**From the chart:**",
      "- Typical ischemic symptoms: 6 hours of crushing substernal pressure (8/10) beginning with exertion, radiating to the left arm, neck, and jaw, with diaphoresis [admission note].",
      "- Acute myocardial injury with a rise and fall: high-sensitivity troponin 86 → 364 → 312 ng/L (ref 0–19) [labs].",
      "- Ischemic ECG changes without ST elevation: persistent 1 mm ST depressions in V4–V6 with T-wave inversions in I and aVL [ECG].",
      "",
      "**From the literature:**",
      "- The Fourth Universal Definition of MI requires a troponin rise and/or fall plus at least one of: ischemic symptoms, new ischemic ECG changes, new Q waves, imaging evidence, or angiographic thrombus. This patient has the troponin pattern plus both symptoms and ECG changes.",
      "- Without ST elevation this is NSTEMI rather than STEMI. ACC/AHA guidance supports an early invasive strategy here — coronary angiography is already planned — with dual antiplatelet therapy, therapeutic anticoagulation, and high-intensity statin. The chart shows aspirin, ticagrelor, heparin infusion, and atorvastatin 80 mg already on board [medications].",
      "",
      "*Sample answer staged for the demo — not a live model response.*"
    ].join("\n")
  },
  {
    question: "What should the overnight team monitor for this NSTEMI patient?",
    answer: [
      "Overnight priorities for this NSTEMI patient awaiting morning catheterization:",
      "",
      "**From the chart:**",
      "- **Recurrent ischemia:** chest discomfort improved from 8/10 to 2/10 but intermittent mild substernal pressure persists, responsive to nitroglycerin [HD1 note]. Any prolonged or severe recurrence warrants a repeat ECG and cardiology notification.",
      "- **Rhythm:** no sustained arrhythmias on telemetry overnight, but continuous monitoring continues [HD1 note]. Admission ECG showed sinus tachycardia at 106 bpm.",
      "- **Hemodynamics:** admission BP was 166/94 with HR 106. Watch for hypotension or instability, particularly with ongoing heparin and nitrates on board.",
      "- **Bleeding:** therapeutic heparin infusion plus dual antiplatelet therapy (aspirin + ticagrelor) is triple antithrombotic therapy — inspect IV sites, monitor hemoglobin, and watch for melena or hematuria [medications].",
      "- **NPO status:** the patient is NPO after midnight for coronary angiography in the morning [HD1 note].",
      "- **Glycemia:** home metformin was held for contrast exposure; sliding-scale insulin was started. He has type 2 diabetes — monitor glucose overnight [medication changes].",
      "",
      "**From the literature:**",
      "- ACC/AHA guidance for NSTEMI emphasizes serial ECGs and troponins to detect re-infarction or extension, continuous rhythm monitoring for malignant arrhythmias (most common in the first 24 hours), and bleeding vigilance on combined antiplatelet plus anticoagulant therapy.",
      "",
      "*Sample answer staged for the demo — not a live model response.*"
    ].join("\n")
  },
  {
    question: "Write a one-paragraph handoff summary for the night team.",
    answer: [
      "61-year-old man with known CAD (DES to LAD 2022) admitted with NSTEMI after 6 hours of crushing substernal chest pressure with troponin rise 86 to 364 ng/L now downtrending to 312, persistent 1 mm ST depressions V4-V6, and echo showing LVEF 48% with anterior hypokinesis [admission note, labs, ECG, HD1 note]. On dual antiplatelet therapy (aspirin + ticagrelor load) with therapeutic heparin infusion, high-intensity atorvastatin, and metoprolol; home metformin held for contrast with sliding-scale insulin started [medications]. Pain improved from 8/10 to 2/10 with intermittent mild discomfort responsive to NTG; hemodynamically stable, no sustained arrhythmias overnight [HD1 note]. NPO after midnight for coronary angiography in the morning with cardiology consulted. **Overnight:** monitor for recurrent chest pain, arrhythmia on telemetry, bleeding on triple therapy, and hypotension; repeat ECG with any concerning symptoms.",
      "",
      "*Sample answer staged for the demo — not a live model response.*"
    ].join("\n")
  },
  {
    question: "What anticoagulation is he on and what is the plan?",
    answer: [
      "**Current antithrombotic regimen and plan:**",
      "",
      "**From the chart:**",
      "- **Therapeutic unfractionated heparin infusion**, maintained with therapeutic monitoring — started for acute coronary syndrome [admission plan, HD1 note].",
      "- **Dual antiplatelet therapy:** aspirin 81 mg daily (continued from home) plus ticagrelor loading dose followed by maintenance dosing, initiated on hospital day 1 [medication changes].",
      "- High-intensity atorvastatin 80 mg nightly continued [home medications].",
      "- **Plan:** coronary angiography in the morning with cardiology consulted; the patient is NPO after midnight [HD1 note]. Peri-procedural anticoagulation management is per the interventional cardiology team.",
      "",
      "**From the literature:**",
      "- ACC/AHA NSTEMI guidance supports an early invasive strategy with periprocedural anticoagulation plus DAPT. Combining DAPT with therapeutic heparin is effectively triple antithrombotic therapy, which raises major bleeding risk — hence the overnight bleeding checks. After PCI, the regimen typically de-escalates per cardiology (often DAPT alone, with duration guided by stent type and bleeding risk).",
      "",
      "*Sample answer staged for the demo — not a live model response.*"
    ].join("\n")
  },
  {
    question: "Which of his home meds need renal dose adjustment?",
    answer: [
      "**Renal review of home medications:**",
      "",
      "**From the chart:**",
      "- Creatinine is stable at 1.0 mg/dL with no acute kidney injury [labs, HD1 note] — renal function is preserved, so **no home medication requires a renal dose reduction** right now.",
      "- **Metformin ER 1000 mg twice daily was HELD** — not for renal impairment, but because iodinated contrast is planned for morning coronary angiography [medication changes]. Metformin is withheld around contrast procedures due to lactic acidosis risk if contrast-induced kidney injury occurs.",
      "- **Lisinopril 20 mg daily** (ACE inhibitor): no dose change needed at this creatinine, but ACE inhibitors plus contrast dye raise acute kidney injury risk — monitor creatinine and potassium post-procedure [home medications].",
      "- **Empagliflozin 25 mg daily:** SGLT2 inhibitors need no renal dose adjustment, but they are commonly held during acute illness, dehydration, or fasting (all present here — NPO, acute MI) because of euglycemic ketoacidosis risk.",
      "- Atorvastatin 80 mg, metoprolol succinate 50 mg, omeprazole 20 mg: no renal dose adjustment required.",
      "",
      "**From the literature:**",
      "- FDA labeling and ACC guidance: metformin should be withheld at the time of iodinated contrast in patients with eGFR <60, history of liver disease, alcoholism, or heart failure, and re-evaluated after 48 hours; SGLT2 inhibitors should be held 3–4 days before scheduled procedures and during acute illness. Creatinine should be rechecked after angiography before restarting either drug.",
      "",
      "*Sample answer staged for the demo — not a live model response.*"
    ].join("\n")
  }
];

// Hands-on demo question: the user sends this (or their own question) and
// gets this staged grounded answer without needing a live model.
export const DEMO_AI_CHAT_HANDS_ON_QUESTION = "What is his bleeding risk on triple therapy?";
export const DEMO_AI_CHAT_HANDS_ON_ANSWER = [
  "**Bleeding risk on triple therapy (heparin + aspirin + ticagrelor)**",
  "",
  "Mr. Morgan is on triple therapy pending cath, which raises bleeding risk:",
  "",
  "- **Chart context:** No prior bleeding history documented; baseline Hgb 14.2 g/dL; platelets 245K. He is 61 with normal renal function (creatinine 1.0 mg/dL).",
  "- **Risk factors:** Triple therapy itself is the main risk — especially at arterial puncture sites, plus GI bleeding risk with DAPT.",
  "- **Mitigation in the plan:** PPI for GI protection is standard with DAPT; monitor Hgb/Hct; watch access sites; heparin infusion allows rapid reversal if needed.",
  "- **Literature:** Peri-PCI triple therapy increases major bleeding vs DAPT alone; current guidance favors minimizing triple-therapy duration (e.g., WOEST, PIONEER AF-PCI trials support dropping aspirin early in selected patients).",
  "",
  "*Sample answer staged for the demo — not a live model response.*"
].join("\n");

// Legacy single Q&A (kept for backwards compatibility; prefer DEMO_AI_CHAT_SAMPLES).
export const DEMO_AI_CHAT_QUESTION = DEMO_AI_CHAT_SAMPLES[0].question;
export const DEMO_AI_CHAT_ANSWER = DEMO_AI_CHAT_SAMPLES[0].answer;

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
    const text = sample.kind === "note" ? DEMO_SCRIBE_NOTE : DEMO_SCRIBE_TRANSCRIPT;
    return `
      <details class="guided-demo-sample" data-demo-sample open>
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
