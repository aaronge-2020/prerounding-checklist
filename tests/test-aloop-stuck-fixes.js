// .aloop stuck fixes (R1-R13): test-first coverage written before the fixes.
// Pure-module behavior tests plus presentation rendering tests, with a few
// source-contract checks in the style of test-ui-feature-modules.js for the
// wiring that only exists inside app.js / controllers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const escapeHtml = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (name) => `[icon:${name}]`;

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ---------------------------------------------------------------- R9 parser
const { parseTypedAdmissionDate, todayIsoDate } = await import("../src/ui/admission-date-input.js");
assert.equal(parseTypedAdmissionDate("10/20/2026"), "2026-10-20");
assert.equal(parseTypedAdmissionDate("2026-10-20"), "2026-10-20");
assert.equal(parseTypedAdmissionDate("2/9/2026"), "2026-02-09");
assert.equal(parseTypedAdmissionDate("02/29/2024"), "2024-02-29", "leap day in a leap year is a real date");
assert.equal(parseTypedAdmissionDate("02/29/2025"), null, "Feb 29 in a non-leap year is not a real date");
assert.equal(parseTypedAdmissionDate("13/01/2026"), null);
assert.equal(parseTypedAdmissionDate("10/32/2026"), null);
assert.equal(parseTypedAdmissionDate(""), null);
assert.equal(parseTypedAdmissionDate("hello"), null);
assert.equal(todayIsoDate(new Date(2026, 9, 20)), "2026-10-20");

// ------------------------------------------------------- R2 operation progress
const { deidOperationProgress, formatElapsed } = await import("../src/ui/deid/operation-progress.js");
assert.equal(formatElapsed(0), "0s");
assert.equal(formatElapsed(9000), "9s");
assert.equal(formatElapsed(65000), "1m 05s");
const opProgress = deidOperationProgress({ active: true, value: 2, total: 5, startedAt: 1000 }, 11000);
assert.equal(opProgress.percent, 40);
assert.equal(opProgress.stepText, "Step 2 of 5");
assert.equal(opProgress.elapsedText, "10s");
const opIndeterminate = deidOperationProgress({ active: true, startedAt: 1000 }, 4000);
assert.equal(opIndeterminate.percent, null, "no value/total means no invented percent");
assert.equal(opIndeterminate.stepText, "");
assert.equal(opIndeterminate.elapsedText, "3s", "elapsed time still shows while the step is unknown");

const { createDeidPresentation } = await import("../src/ui/deid/presentation.js");
const deidPres = createDeidPresentation({ escapeHtml, icon });
const opMarkup = deidPres.renderDeidOperation({
  active: true,
  message: "De-identifying this source locally...",
  value: 2,
  total: 5,
  startedAt: Date.now() - 3000
});
assert.match(opMarkup, /data-deid-operation-elapsed/, "de-id operation shows an elapsed-time element");
assert.match(opMarkup, /Step 2 of 5/, "de-id operation names the current step");

// ------------------------------------------------------- R11 mode persistence
const { loadPersistedDeidMode, persistDeidMode, DEID_MODE_STORAGE_KEY } = await import("../src/app/deid-mode-preference.js");
const validKeys = ["structured", "stanford", "openmed-small"];
const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
{
  const storage = memoryStorage();
  assert.equal(loadPersistedDeidMode(storage, validKeys, "stanford"), "stanford", "nothing stored means the default");
  persistDeidMode(storage, "structured");
  assert.equal(storage.getItem(DEID_MODE_STORAGE_KEY), "structured");
  assert.equal(loadPersistedDeidMode(storage, validKeys, "stanford"), "structured", "the chosen mode survives a reload");
  persistDeidMode(storage, "bogus-key");
  assert.equal(loadPersistedDeidMode(storage, validKeys, "stanford"), "stanford", "an unknown stored key falls back, never sticks");
  const broken = {
    getItem() {
      throw new Error("no storage");
    },
    setItem() {
      throw new Error("no storage");
    }
  };
  assert.equal(loadPersistedDeidMode(broken, validKeys, "stanford"), "stanford");
  persistDeidMode(broken, "structured"); // must not throw
}

// ------------------------------------------------------------- R13 view history
const { parseViewHash, viewHash } = await import("../src/ui/view-history.js");
const viewIds = ["vault", "daily", "review", "aiChat"];
assert.equal(parseViewHash("#review", viewIds), "review");
assert.equal(parseViewHash("#aiChat", viewIds), "aiChat");
assert.equal(parseViewHash("#bogus", viewIds), null);
assert.equal(parseViewHash("", viewIds), null);
assert.equal(viewHash("review"), "#review");

// ------------------------------------------------------------- R3 summary list
const { createRedactionPresentation } = await import("../src/ui/redaction/presentation.js");
const redactionPres = createRedactionPresentation({ escapeHtml, icon });
assert.equal(typeof redactionPres.renderRedactionSummary, "function", "redaction presentation exposes a summary list");
const sampleReview = {
  inspectedRedactionIndex: -1,
  redactions: [
    { placeholder: "[NAME]", original: "Daniel Morgan", occurrence: 0, state: "pending" },
    { placeholder: "[MRN]", original: "NRM-847295104", occurrence: 0, state: "confirmed" }
  ]
};
const summaryHtml = redactionPres.renderRedactionSummary(sampleReview, { scope: "context", sectionId: "s1" });
assert.match(summaryHtml, /data-redaction-summary/);
assert.match(summaryHtml, /Daniel Morgan/, "summary lists each original");
assert.match(summaryHtml, /\[MRN\]/, "summary lists each replacement");
assert.match(
  summaryHtml,
  /data-action="accept-section-redaction"[^>]*data-redaction-index="0"|data-redaction-index="0"[^>]*data-action="accept-section-redaction"/,
  "pending item has a one-click Accept"
);
assert.match(
  summaryHtml,
  /data-action="allow-reviewed-non-phi"[^>]*data-redaction-index="0"|data-redaction-index="0"[^>]*data-action="allow-reviewed-non-phi"/,
  "pending item has a one-click Reject"
);
const sectionReviewHtml = redactionPres.renderSectionSurface({
  section: { id: "s1", label: "HPI" },
  scope: "context",
  review: sampleReview,
  editing: false,
  draftText: "[NAME] and [MRN]",
  sections: [],
  reviewFor: () => null
});
assert.match(sectionReviewHtml, /data-redaction-summary/, "section review embeds the summary list");

// ------------------------------------------------- R12 + R11 quick de-id markup
const { createQuickDeidPresentation } = await import("../src/ui/quick-deid/presentation.js");
const quickPres = createQuickDeidPresentation({ escapeHtml, icon });
const quickEmpty = quickPres.renderQuickDeid({
  hasReview: false,
  disabled: true,
  busy: false,
  admissionDate: "",
  quickDeidInput: "",
  verifyWithLlm: false,
  verifierModelLabel: "",
  verifierAvailable: false,
  renderQuickModelControlHtml: "",
  renderQuickDeidReviewHtml: ""
});
assert.match(quickEmpty, /Paste text first/, "empty Quick De-ID shows the paste hint where the user is looking");
const quickReady = quickPres.renderQuickModelControl({
  option: { key: "gliner", label: "GLiNER", shortLabel: "GLiNER", description: "d" },
  state: { state: "checking", ready: false },
  busy: false,
  progress: null,
  error: "",
  webGpuAvailable: true,
  isInstallable: false,
  modelPackBusyKey: "",
  deidModelSelectOptionsHtml: "",
  quickDeidStatus: "",
  modelPackProgressText: "",
  verifiedReady: false
});
assert.doesNotMatch(
  quickReady,
  /Verified and ready locally/,
  "Quick De-ID must not claim verified-ready when the shared status says not loaded"
);
assert.match(quickReady, /Not loaded yet/, "Quick De-ID shows the same not-loaded wording as Hospital Stay");
const quickVerified = quickPres.renderQuickModelControl({
  option: { key: "gliner", label: "GLiNER", shortLabel: "GLiNER", description: "d" },
  state: { state: "checking", ready: false },
  busy: false,
  progress: null,
  error: "",
  webGpuAvailable: true,
  isInstallable: false,
  modelPackBusyKey: "",
  deidModelSelectOptionsHtml: "",
  quickDeidStatus: "",
  modelPackProgressText: "",
  verifiedReady: true
});
assert.match(quickVerified, /Verified and ready locally/, "Quick De-ID claims ready only when the shared status is ready");

// ------------------------------------------------------------ source contracts
const indexHtml = await readSource("index.html");
const appJs = await readSource("src/ui/app.js");
const demoControllerJs = await readSource("src/ui/demo/controller.js");
const demoPresentationJs = await readSource("src/ui/demo/presentation.js");
const reviewControllerJs = await readSource("src/ui/review/controller.js");
const aiChatPresentationJs = await readSource("src/ui/ai-chat/presentation.js");
const aiChatControllerJs = await readSource("src/ui/ai-chat/controller.js");
const gateJs = await readSource("src/ui/admission-date-gate.js");

// R1: startup shell shows progress and a retry path.
assert.match(
  indexHtml,
  /class="spinner"[^>]*aria-hidden="true"><\/span> Preparing secure vault|Preparing secure vault[\s\S]{0,200}class="spinner"/,
  "startup shell shows a spinner"
);
assert.match(indexHtml, /startup-watchdog\.js/, "startup watchdog is loaded");
assert.match(appJs, /__preroundingBooted = true/, "app marks boot complete for the watchdog");

// R4: tour callout can be dismissed.
assert.match(demoPresentationJs, /dismiss-demo-callout/, "callout renders a dismiss control");
assert.match(demoControllerJs, /dismiss-demo-callout/, "demo controller handles callout dismissal");

// R5: write-note advance waits for a real, settled edit.
assert.match(demoControllerJs, /writeNoteBaseline/, "demo controller records the one-liner text before editing");
assert.doesNotMatch(
  demoControllerJs,
  /session\.stage = "open-prompts";\s*\n\s*renderApp\(\);\s*\n\s*\}\);/,
  "write-note no longer advances on the first raw input event"
);

// R6: autosave always settles the indicator.
assert.match(reviewControllerJs, /Save did not finish/, "a failed save shows a plain failure state instead of Saving forever");
assert.match(reviewControllerJs, /catch\s*\{[^}]*settleAutosaveFailure\(\)/s, "persist settles the indicator on failure too");

// R7: scribe total download size up front in both shells.
for (const html of [indexHtml, await readSource("scribe-parakeet.html")]) {
  assert.match(html, /Total download: about 689 MB/, "scribe setup states the total download size before the download button");
}

// R8: chat gate links to the model menu and the controller opens it.
assert.match(aiChatPresentationJs, /ai-chat-open-model-menu/, "chat composer offers a direct Get a model control when no model is ready");
assert.match(aiChatControllerJs, /ai-chat-open-model-menu/, "chat controller handles the Get a model control");

// R9/R10: the gate offers typed entry, a Today shortcut, and reads the page field first.
assert.match(indexHtml, /id="admissionDateTextInput"/, "admission dialog has a typed date field");
assert.match(indexHtml, /id="admissionDateToday"/, "admission dialog has a Use today button");
assert.match(gateJs, /dailyAdmissionDateInput/, "gate reads the admission date already entered on the page before opening the dialog");
assert.match(gateJs, /parseTypedAdmissionDate/, "gate accepts a typed mm/dd/yyyy date");

// R12: app disables Run while the Quick De-ID box is empty.
assert.match(
  appJs,
  /disabled: Boolean\(app\.modelPackBusyKey \|\| app\.quickDeidBusy\) \|\| !app\.quickDeid\.input\.trim\(\)|!app\.quickDeid\.input\.trim\(\)/,
  "Run de-identification is disabled while the source box is empty"
);

// R13: back moves within the app, and a restored passphrase re-enables Unlock.
assert.match(appJs, /addEventListener\("hashchange"|addEventListener\("popstate"/, "app listens for browser back/forward");
assert.match(
  appJs,
  /updateVaultPrimaryActionEnabled\(passphraseInput\.value\)/,
  "locked-vault render syncs Unlock from the field's current value"
);

// ------------------------------------------- Round 2: D2 autosave settles
// persistDraftToVaultInner sits inside the review controller factory, which
// needs a full DOM and vault to instantiate, so its two no-op exits stay
// contract-checked here; the check names the exact exits D2 is about.
assert.match(
  reviewControllerJs,
  /if \(!current\.patient\) \{ settleAutosaveNoop\(\); return; \}/,
  "D2: the no-patient exit settles the autosave indicator instead of leaving Saving up"
);
assert.match(
  reviewControllerJs,
  /if \(!scheduled\.packetId\) \{ settleAutosaveNoop\(\); return; \}/,
  "D2: the patient-switch exit with no packet settles the autosave indicator"
);
assert.match(
  reviewControllerJs,
  /function settleAutosaveNoop\(\) \{[^}]*"Auto-save on"[^}]*dataset\.state = "idle"/s,
  "D2: the no-op settle returns the indicator to its idle state, not a Saved claim"
);

// ---------------------------------------------- Round 2: D3 quick mode persists
{
  const runStart = appJs.indexOf("async function runQuickDeid()");
  const runBody = appJs.slice(runStart, appJs.indexOf("\n}\n", runStart));
  assert.match(
    runBody,
    /app\.deidMode = byId\("quickDeidMode"\)\?\.value \|\| app\.deidMode;\s*\n\s*persistDeidMode\(localStorage, app\.deidMode\);/,
    "D3: runQuickDeid persists the mode it syncs from the Quick De-ID select"
  );
}

// ------------------------------------------- Round 3: D5 pack flows persist
// The live model-pack flows in app.js switch or reset app.deidMode as a side
// effect; each must persist the mode it leaves showing, like the three sites
// that already persist (selectDeidModel, the shared change handler,
// runQuickDeid), or a reload restores the previously persisted mode instead.
{
  const sliceBody = (name) => {
    const start = appJs.indexOf(`async function ${name}(`);
    assert.notEqual(start, -1, `D5: ${name} exists in app.js`);
    return appJs.slice(start, appJs.indexOf("\n}\n", start));
  };
  for (const name of ["importSelectedModelPack", "downloadSelectedModelPack", "verifyInstalledModelPack"]) {
    assert.match(
      sliceBody(name),
      /app\.deidMode = option\.key;\s*persistDeidMode\(localStorage, app\.deidMode\);/,
      `D5: ${name} persists the mode it switches to`
    );
  }
  assert.match(
    sliceBody("removeSelectedModelPack"),
    /app\.deidMode = DEFAULT_DEID_MODEL_KEY;\s*persistDeidMode\(localStorage, app\.deidMode\);/,
    "D5: removeSelectedModelPack persists the default mode it resets to"
  );
}

// ------------------------------ Round 2: D1 behavior tests, R13 view history
assert.equal(parseViewHash("#/review", viewIds), null, "a slash-prefixed hash names no view");
assert.equal(parseViewHash("#REVIEW", viewIds), null, "view names are case-sensitive");
assert.equal(parseViewHash("#review?x=1", viewIds), null, "a hash with a query suffix names no view");
assert.equal(parseViewHash("# review ", viewIds), "review", "surrounding spaces are trimmed before matching");
assert.equal(parseViewHash(null, viewIds), null, "null hash names no view");
assert.equal(parseViewHash(undefined, viewIds), null, "undefined hash names no view");
assert.equal(parseViewHash(42, viewIds), null, "a non-string hash names no view");
assert.equal(parseViewHash("#review", []), null, "no valid views means no view");
assert.equal(viewHash(""), "#");
assert.equal(viewHash(null), "#");
for (const id of viewIds) {
  assert.equal(parseViewHash(viewHash(id), viewIds), id, `hash round-trips for ${id}`);
}

// --------------------------- Round 2: D1 behavior tests, R4 demo presentation
const { createDemoPresentation, demoNextStage, demoStage, DEMO_GUIDE_STAGES } = await import("../src/ui/demo/presentation.js");
const demoPres = createDemoPresentation({ escapeHtml });
assert.equal(demoPres.renderCallout({ stage: {} }), "", "a stage with no callout renders nothing");
{
  const calloutHtml = demoPres.renderCallout({ stage: DEMO_GUIDE_STAGES["write-note"] });
  assert.match(calloutHtml, /data-action="dismiss-demo-callout"/, "R4: the rendered callout carries its Hide control");
  assert.match(calloutHtml, /Hide this note/, "R4: the Hide control is labelled in plain words");
  assert.match(calloutHtml, /Review before asking for feedback/, "R4: the callout shows the stage's own title");
}
{
  const evil = demoPres.renderCallout({ stage: { calloutTitle: "<b>x</b>", callout: "<script>1</script>" } });
  assert.doesNotMatch(evil, /<script>/, "callout text is escaped, never raw markup");
  assert.match(evil, /&lt;script&gt;/, "callout text survives as visible text");
}
assert.equal(demoStage("no-such-stage").title, DEMO_GUIDE_STAGES["save-context"].title, "an unknown stage falls back to the first stage");
assert.equal(demoNextStage("parse-note"), "open-drug-checks", "info stage follows its explicit next stage");
assert.equal(demoNextStage("save-context"), "context-review", "an action stage falls back to guide order");
assert.equal(demoNextStage("done"), null, "the final stage has no next stage");
assert.equal(demoNextStage("no-such-stage"), null, "an unknown stage has no next stage");

// --------------------- Round 2: D1 behavior tests, R5 write-note advance rule
const { writeNoteEditAdvances, demoReviewTransition } = await import("../src/ui/demo/controller.js");
assert.equal(typeof writeNoteEditAdvances, "function", "R5: the advance rule is a callable pure function");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: "AB", baseline: "A" }), true, "a changed, non-empty edit advances");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: "A", baseline: "A" }), false, "retyping the baseline text does not advance");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: "   ", baseline: "A" }), false, "an emptied edit does not advance");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: "", baseline: "A" }), false, "an empty edit does not advance");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: "AB", baseline: null }), false, "no captured baseline means no advance");
assert.equal(writeNoteEditAdvances({ stage: "open-prompts", text: "AB", baseline: "A" }), false, "typing outside the write-note stage does not advance");
assert.equal(writeNoteEditAdvances({ stage: "write-note", text: undefined, baseline: "A" }), false, "a missing text value does not advance or throw");
assert.equal(writeNoteEditAdvances(), false, "missing arguments do not advance or throw");
assert.equal(demoReviewTransition("keep-reviewed-redaction", true), "preserve-review", "a review action with review left preserves the review");
assert.equal(demoReviewTransition("keep-reviewed-redaction", false), "complete-review", "a review action with nothing left completes the review");
assert.equal(demoReviewTransition("copy-prompt", true), "unrelated", "a non-review action is unrelated to review flow");

// --------------------- Round 2: D4 rendering state for restored summary rows
{
  const restoredHtml = redactionPres.renderRedactionSummary(
    { redactions: [{ placeholder: "[NAME]", original: "Daniel Morgan", occurrence: 0, state: "restored" }] },
    { scope: "context", sectionId: "s1" }
  );
  assert.match(restoredHtml, /Restored/, "D4 context: a restored row at least names its state in the summary list");
}

console.log("test-aloop-stuck-fixes: all assertions passed");
