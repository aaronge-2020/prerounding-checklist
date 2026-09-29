// Regression test: AI Chat must download, load, and verify the best
// de-identification system automatically - no manual model setup.
//
// Before this change, sending in ChatGPT mode refused with
// "Download a de-identification model to enable sending." and the banner's
// Download button only preloaded whichever model the global de-id mode
// happened to select (or refused outright for structured mode). Now the
// AI chat always uses the best system - the default clinical model -
// downloading, loading, and verifying it automatically on first use, and
// warming it in the background when the AI Chat view opens.
//
// Part 1 (source guards): the send gate auto-ensures instead of refusing,
// the remote de-id info reports the default model, and opening AI Chat
// warms the model.
// Part 2 (behavioral): the real ai-chat controller's ensureDeidReady seam
// verifies the DEFAULT (best) model key even when app.deidMode is
// "structured", no-ops when ready, and fails closed on blockers.
//
// All fixtures are synthetic and PHI-free. No browser needed.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Part 1: source guards
// ---------------------------------------------------------------------------

const controllerSource = await readFile(new URL("../src/ui/ai-chat/controller.js", import.meta.url), "utf8");

assert.ok(
  !controllerSource.includes("Download a de-identification model to enable sending."),
  "sendRemoteChat must not refuse when the de-id model is not ready - it auto-loads the best system now"
);
assert.ok(
  controllerSource.includes("await ensureBestDeidModelReady()"),
  "sendRemoteChat must auto-ensure the best de-identification model before sending"
);
assert.ok(
  !controllerSource.includes("Structured de-identification can't be used for ChatGPT sends"),
  "the ChatGPT path no longer depends on the manual de-id mode choice"
);

{
  const start = controllerSource.indexOf("function remoteDeidInfo()");
  assert.ok(start >= 0, "remoteDeidInfo exists");
  const body = controllerSource.slice(start, controllerSource.indexOf("\n  }\n", start));
  assert.ok(
    body.includes("DEFAULT_DEID_MODEL_KEY"),
    "remoteDeidInfo must report the best (default) de-identification system, not app.deidMode"
  );
  assert.ok(
    !body.includes("app.deidMode"),
    "remoteDeidInfo must not depend on the manual de-id mode choice"
  );
}

const appSource = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
assert.ok(
  appSource.includes("aiChatController.ensureDeidReady()"),
  "opening the AI Chat view must warm the best de-identification model in the background"
);
assert.ok(
  appSource.includes("isRemoteMode"),
  "the background warm-up must only run for ChatGPT (remote) mode"
);

console.log("Part 1 passed: AI Chat auto-loads the best de-identification system (source guards)");

// ---------------------------------------------------------------------------
// Part 2: behavioral proof with the real ai-chat controller
// ---------------------------------------------------------------------------

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = {
  createElement: () => ({
    style: {},
    content: { querySelector: () => null },
    set innerHTML(value) { this._html = value; },
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.Worker = class {
  constructor() {}
  postMessage() {}
  terminate() {}
  addEventListener() {}
};

const { createAiChatController } = await import("../src/ui/ai-chat/controller.js");
const { DEFAULT_DEID_MODEL_KEY } = await import("../src/patient-context/deid-model-options.js");

function makeController({ ready = false, blocker = "", verifyImpl } = {}) {
  const calls = { verify: [] };
  let readyState = ready;
  const statuses = [];
  const deidDeps = {
    getSelectedDeidModelStatus: (key) => ({
      ready: readyState,
      modelKey: key,
      label: "Test clinical deidentifier",
      message: readyState ? "ready" : "not loaded",
    }),
    getAdvancedDeidStatus: () => ({}),
    crossOriginIsolationBlocker: () => blocker,
    verifyAdvancedDeidModel:
      verifyImpl ||
      (async (options) => {
        calls.verify.push(options);
        readyState = true;
      }),
    deidentifyText: async () => {
      throw new Error("not stubbed");
    },
  };
  const controller = createAiChatController({
    // Even with the weakest manual mode selected, AI Chat must use the best system.
    app: { deidMode: "structured" },
    byId: () => null,
    escapeHtml: (value) => String(value),
    icon: () => "",
    setStatus: (message) => statuses.push(message),
    render: () => {},
    getDraftNoteText: () => "",
    currentPreferences: () => ({}),
    onChatServiceChange: () => {},
    deidDeps,
  });
  return { controller, calls, statuses, setReady: (value) => { readyState = value; } };
}

// The best system is verified automatically, ignoring the manual mode choice.
{
  const { controller, calls, statuses } = makeController({ ready: false });
  await controller.ensureDeidReady();
  assert.equal(calls.verify.length, 1, "one verify call for the not-ready model");
  assert.equal(
    calls.verify[0]?.modelKey,
    DEFAULT_DEID_MODEL_KEY,
    "AI Chat verifies the best (default) de-identification system"
  );
  assert.ok(
    statuses.some((message) => message.includes("downloads it once")),
    "the user is told the first run is a one-time download"
  );
}

// Already ready: no work, no download.
{
  const { controller, calls } = makeController({ ready: true });
  const result = await controller.ensureDeidReady();
  assert.equal(calls.verify.length, 0, "no verify call when the best system is already ready");
  assert.ok(result?.ready, "returns the ready status");
}

// Cross-origin isolation blocker: fail closed before any download.
{
  const { controller, calls } = makeController({ ready: false, blocker: "Reload this page, then try again." });
  await assert.rejects(
    controller.ensureDeidReady(),
    /Reload this page/,
    "the isolation blocker surfaces instead of a doomed download"
  );
  assert.equal(calls.verify.length, 0, "no verify call when blocked");
}

// Verify ran but the model never reported ready: fail closed, loudly.
{
  const { controller, calls } = makeController({
    ready: false,
    verifyImpl: async (options) => {
      calls.verify.push(options);
      // Deliberately leave readyState false.
    },
  });
  const error = await controller.ensureDeidReady().then(
    () => null,
    (caught) => caught
  );
  assert.ok(error instanceof Error, "a verify that never reports ready must throw");
  assert.ok(error.message.length > 0, "the failure carries an explanatory message");
}

console.log("Part 2 passed: ensureDeidReady verifies the best system automatically and fails closed");

// ---------------------------------------------------------------------------
// Part 3: the context budget meter is honest in ChatGPT mode
// ---------------------------------------------------------------------------
// Regression: with nothing selected, the sidebar meter showed
// "Patient ~3,340" while the checkboxes implied selection controls the
// context. The meter was right — ChatGPT mode always sends the full chart
// through the review gate — but two things were wrong: (1) turning the
// "Attach to chat" toggle off dropped the meter to 0 even though the full
// chart is still what gets sent, and (2) the selection controls looked
// live in ChatGPT mode when they only apply to on-device chat.

const { createAiChatPresentation } = await import("../src/ui/ai-chat/presentation.js");
const presentation = createAiChatPresentation({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  icon: () => "",
});

const sidebarBase = {
  hardware: { recommendation: { models: [], recommendedKey: null } },
  settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: false },
  llmStatus: { status: "ready", verified: true, activeModelKey: "" },
  chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false },
  downloaded: {},
  remote: { messages: [], sending: false, webSearch: true, review: null },
  hasApiKey: true,
  sidebarOpen: true,
  patientContext: { enabled: false, available: false, label: "TR-3", hasPatient: true },
};

// Aaron's report: nothing selected in ChatGPT mode, meter said ~3,340.
// The full chart is what actually goes, so the meter must keep saying so
// even with the attach toggle off.
function inspectorVm({ isRemote, enabled }) {
  return {
    open: true,
    enabled,
    isRemote,
    hasPatient: true,
    patientLabel: "TR-3",
    pieces: [
      { id: "epic-results", group: "Admission", label: "Epic results", tokens: 783, selected: false },
      { id: "draft-note", group: "Draft note", label: "Current draft note", tokens: 1927, selected: false },
    ],
    groups: ["Admission", "Draft note"],
    guidelinesTokens: 178,
    historyTokens: 381,
    historyCount: 2,
    // The controller counts the full chart here in remote mode.
    selectedTokens: 3340,
    contextWindow: 1050000,
    windowLabel: "GPT-6 Luna",
  };
}

function patientLine(html) {
  const m = html.match(/Patient ~([\d,]+)/);
  assert.ok(m, "meter names the patient token count");
  return m[1];
}

{
  const html = presentation.render({
    ...sidebarBase,
    mode: "remote",
    contextInspector: inspectorVm({ isRemote: true, enabled: false }),
  });
  assert.equal(patientLine(html), "3,340", "remote meter counts the full chart with the toggle off");
  assert.ok(html.includes("sends the full chart"), "remote sidebar explains the full chart goes through review");
  const pieceInput = html.match(/data-ai-chat-context-piece="epic-results"[^>]*>/);
  assert.ok(pieceInput && pieceInput[0].includes("disabled"), "piece checkboxes are inert in ChatGPT mode");
  const toggles = [...html.matchAll(/data-ai-chat-context-toggle[^>]*>/g)];
  assert.ok(toggles.length >= 2, "both context toggles rendered");
  assert.ok(
    toggles.every((m) => m[0].includes("disabled")),
    "every attach toggle is inert in ChatGPT mode"
  );
}

{
  // On-device mode is unchanged: toggle off means zero patient tokens,
  // and the selection controls stay live.
  const html = presentation.render({
    ...sidebarBase,
    mode: "local",
    contextInspector: inspectorVm({ isRemote: false, enabled: false }),
  });
  assert.equal(patientLine(html), "0", "on-device meter shows 0 with the toggle off");
  assert.ok(!html.includes("sends the full chart"), "no full-chart note in on-device mode");
  const toggle = html.match(/data-ai-chat-context-toggle[^>]*>/);
  assert.ok(toggle && !toggle[0].includes("disabled"), "attach toggle stays live in on-device mode");
}

{
  // On-device mode with the toggle on and a piece selected still counts it.
  const inspector = inspectorVm({ isRemote: false, enabled: true });
  inspector.pieces[0].selected = true;
  inspector.selectedTokens = 783;
  const html = presentation.render({ ...sidebarBase, mode: "local", contextInspector: inspector });
  assert.equal(patientLine(html), "783", "on-device meter counts selected pieces");
  const pieceInput = html.match(/data-ai-chat-context-piece="epic-results"[^>]*>/);
  assert.ok(pieceInput && !pieceInput[0].includes("disabled"), "piece checkboxes are live in on-device mode");
}

console.log("Part 3 passed: the budget meter and selection controls are honest in ChatGPT mode");
