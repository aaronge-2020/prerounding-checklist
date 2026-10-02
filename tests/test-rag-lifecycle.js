// Chart-grounded cited answers: lifecycle tests.
//
// API mode: the FULL chart goes through the de-id review gate, the exact
// reviewed bytes are what gets sent (one outer wrapper, no raw PHI, no
// embedding model anywhere), and section citations keep their quotes and
// navigate to the saved chart source.
// Local mode: the embedding model downloads only on the explicit user tap;
// ready retrieval supplies section-labelled top-k context; a patient change
// mid-retrieval hard-aborts and preserves the unsent message; index warming
// never downloads.
//
// All fixtures are synthetic and PHI-free. The controller is exercised
// through its seams (ragDeps/deidDeps/chatDeps/clientDeps); no DOM, no
// network.
import assert from "node:assert/strict";

import { createAiChatController } from "../src/ui/ai-chat/controller.js?v=20260929-ai-chat-v14";

// --- Synthetic chart -------------------------------------------------------
function makePatient() {
  return {
    id: "patient-1",
    displayLabel: "Elena Ruiz",
    metadata: { admissionDate: "09/14/2026" },
    contextSections: [
      { id: "s1", label: "History of Present Illness", sourceKind: "h_and_p", deidentifiedText: "Elena Ruiz reports chest pain radiating to the left arm." }
    ],
    days: [
      {
        id: "d1",
        label: "Hospital day 1",
        date: "09/14/2026",
        sourceCaptures: [
          { id: "c1", label: "Progress note", sourceKind: "progress_note", deidentifiedText: "Elena Ruiz stable overnight." }
        ],
        quickNotes: ["Call cardiology re Elena Ruiz"]
      }
    ]
  };
}

// --- Harness ---------------------------------------------------------------
function makeHarness({ ragStub = {}, clientStub = null, chatReply = null, navigate = null, agentStub = null, chatStub = null } = {}) {
  const statuses = [];
  const sentInputs = [];
  const agentCalls = [];
  const ragCalls = { getRagStatus: 0, ensureChartIndex: 0, retrieveChartChunks: 0, warmChartIndex: 0, clearRagWorkerMemory: 0 };
  const navigations = [];
  let html = "";
  // Fake composer: lets tests prove an aborted send's draft is restored to
  // the input (and never into another patient's composer).
  const composer = { textContent: "", getAttribute: () => null, focus: () => {} };
  const root = {
    set innerHTML(value) { html = String(value); },
    get innerHTML() { return html; },
    querySelector: (sel) => (sel === "[data-ai-chat-input]" ? composer : null),
    querySelectorAll: () => []
  };
  const app = {
    vault: { patients: [makePatient()], activePatientId: "patient-1" },
    deidMode: "test-mode"
  };
  const deidStub = {
    // Deterministic test de-identifier: returns entity spans for the
    // synthetic PHI; the review machinery applies them as redactions so
    // the approved text is de-identified. Redactions arrive "pending" and
    // the test accepts them like a student would.
    deidentifyText: async (text) => {
      const raw = String(text);
      const entities = [];
      for (const [needle, label, placeholder] of [
        ["Elena Ruiz", "PERSON", "[PERSON]"],
        ["09/14/2026", "DATE", "[DATE]"]
      ]) {
        let from = 0;
        for (;;) {
          const start = raw.indexOf(needle, from);
          if (start < 0) break;
          entities.push({ start, end: start + needle.length, label, renderedPlaceholder: placeholder });
          from = start + 1;
        }
      }
      return { text: raw, counts: {}, flags: [], entities, modelId: "test-deid-model" };
    },
    getSelectedDeidModelStatus: () => ({ ready: true }),
    getAdvancedDeidStatus: () => ({}),
    preloadAdvancedDeidModel: async () => {},
    STRUCTURED_DEID_MODE: "structured"
  };
  const defaultChatStub = {
    requestOpenAiChat: async ({ input }) => {
      sentInputs.push(input);
      return chatReply ?? "Noted.";
    },
    requestOpenAiChatWithUsage: async ({ input }) => {
      sentInputs.push(input);
      return { text: chatReply ?? "Noted.", usage: null };
    }
  };
  const defaultRag = {
    getRagStatus: async () => ({ ready: false }),
    ensureChartIndex: async () => ({ chunkCount: 0 }),
    retrieveChartChunks: async () => [],
    warmChartIndex: async () => ({ chunkCount: 0 }),
    clearRagWorkerMemory: async () => {}
  };
  // Every RAG call is counted, even when the test overrides the behavior.
  const ragDeps = {};
  for (const [key, fn] of Object.entries({ ...defaultRag, ...ragStub })) {
    ragDeps[key] = async (...args) => { ragCalls[key]++; return fn(...args); };
  }
  const defaultClient = {
    getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
    chat: async () => "local stub reply",
    resetChat: async () => {},
    onStatusChange: () => {},
    getLocalLlmHardwareReport: async () => ({ recommendation: {} })
  };
  let ctrl;
  ctrl = createAiChatController({
    app,
    byId: (id) => (id === "aiChatContent" ? root : null),
    escapeHtml: (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    icon: () => "",
    setStatus: (m) => statuses.push(String(m)),
    render: () => { ctrl.render(); },
    getDraftNoteText: () => "",
    currentPreferences: () => ({ openAiApiKey: "sk-test", openAiModel: "gpt-5.4-mini", medicalService: "medicine" }),
    onChatServiceChange: () => {},
    onOpenAiModelChange: () => {},
    onNavigateToChartSection: navigate || ((target) => navigations.push(target)),
    deidDeps: deidStub,
    chatDeps: chatStub || defaultChatStub,
    // Clinical-tools mode is on by default: the agent seam carries the
    // reply text (chatReply), so API tests exercise the tool path. The
    // reviewed payload travels in args.messages. A custom agentStub is
    // wrapped so its calls are recorded too.
    agentDeps: (() => {
      const base = agentStub || {
        runAgent: async (args) => ({ text: chatReply ?? "Noted.", toolCalls: [], toolResults: [] })
      };
      const runAgent = base.runAgent.bind(base);
      return { ...base, runAgent: async (args) => { agentCalls.push(args); return runAgent(args); } };
    })(),
    ragDeps,
    clientDeps: { client: clientStub || defaultClient }
  });
  return { ctrl, app, statuses, sentInputs, agentCalls, ragCalls, navigations, root: () => html, composer };
}

function clickAction(ctrl, action, extra = {}) {
  const target = {
    dataset: { action, ...extra },
    closest: (sel) => (sel === "[data-action]" ? target : null)
  };
  return ctrl.click(target);
}

function clickSectionChip(ctrl, pieceId, messageIndex) {
  const chip = { dataset: { sectionCite: pieceId, messageIndex: String(messageIndex) } };
  return ctrl.click({ closest: (sel) => (sel === "[data-section-cite]" ? chip : null) });
}

function assistantIndex(ctrl, reply) {
  return ctrl.getRemoteState().messages.indexOf(reply);
}

function submitText(ctrl, text) {
  const input = { textContent: text };
  const form = { querySelector: (sel) => (sel === "[data-ai-chat-input]" ? input : null) };
  const event = {
    target: { closest: (sel) => (sel === "[data-ai-chat-form]" ? form : null) },
    preventDefault: () => {}
  };
  return ctrl.submit(event);
}

async function until(fn, label, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function sendRemoteWithApproval(harness, question) {
  const { ctrl } = harness;
  clickAction(ctrl, "ai-chat-mode", { mode: "remote" });
  submitText(ctrl, question);
  await until(() => {
    const r = ctrl.getRemoteReview();
    return r && r.phase === "ready" ? r : null;
  }, "review ready");
  // Accept the test de-identifier's proposed redactions, like a student would.
  clickAction(ctrl, "ai-chat-hipaa-accept-all-pending");
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-hipaa-ack]", checked: true });
  clickAction(ctrl, "ai-chat-hipaa-confirm");
  await until(() => harness.sentInputs.length > 0 || harness.agentCalls.length > 0, "request sent");
  await until(() => ctrl.getRemoteState().messages.some((m) => m.role === "assistant"), "reply arrived");
  return ctrl.getRemoteState().messages.find((m) => m.role === "assistant");
}

// --- API mode --------------------------------------------------------------
console.log("api: full chart enters the review gate (no selection, no retrieval)");
{
  const harness = makeHarness();
  const { ctrl, ragCalls } = harness;
  clickAction(ctrl, "ai-chat-mode", { mode: "remote" });
  submitText(ctrl, "What is the plan?");
  const review = await until(() => {
    const r = ctrl.getRemoteReview();
    return r && r.phase === "ready" ? r : null;
  }, "review ready");
  const pieceIds = review.pieces.map((p) => p.id);
  assert.ok(pieceIds.includes("header"), "patient header is reviewed");
  assert.ok(pieceIds.includes("admission:s1"), "admission section is reviewed");
  assert.ok(pieceIds.includes("day:d1:c1"), "day capture is reviewed");
  assert.ok(pieceIds.includes("day:d1:quicknotes"), "quick notes are reviewed");
  assert.equal(ragCalls.getRagStatus, 0, "no embedding status probe on the API path");
  assert.equal(ragCalls.retrieveChartChunks, 0, "no retrieval on the API path");
  assert.equal(ragCalls.ensureChartIndex, 0, "no indexing on the API path");
  assert.ok(review.systemPromptText.includes("does not contain the answer"),
    "missing-evidence instruction is in the system prompt");
  console.log("ok - full chart reviewed, no embedding model touched");
}

console.log("api: exact reviewed bytes are sent — one wrapper, de-identified, no raw PHI");
{
  const harness = makeHarness({
    chatReply: "The chart notes per [History of Present Illness]: 'chest pain radiating to the left arm'."
  });
  await sendRemoteWithApproval(harness, "Summarize the HPI.");
  const { agentCalls, ragCalls } = harness;
  assert.ok(agentCalls.length > 0, "tool path invoked");
  const messages = agentCalls[0].messages;
  assert.ok(Array.isArray(messages), "agent messages array");
  // The de-identified chart travels as the system entry; the question as user.
  const content = messages.map((e) => String(e.content || "")).join("\n");
  const wrapper = "[De-identified patient context — verified by the student before sending]";
  assert.equal(content.split(wrapper).length - 1, 1, "exactly one outer context wrapper");
  assert.ok(!content.includes("Elena Ruiz"), "raw patient name never sent");
  assert.ok(!content.includes("09/14/2026"), "raw admission date never sent");
  assert.ok(/\[[A-Z][A-Z ]+\]/.test(content), "de-identification markers present");
  assert.ok(content.includes("chest pain radiating to the left arm"), "admission section sent");
  assert.ok(content.includes("stable overnight"), "day capture sent");
  assert.ok(content.includes("Call cardiology"), "quick notes sent");
  assert.equal(ragCalls.ensureChartIndex, 0, "send path never indexes");
  assert.equal(ragCalls.retrieveChartChunks, 0, "send path never retrieves");
  console.log("ok - exact reviewed bytes on the wire");
}

console.log("api: section citations keep the quote and resolve to the chart source");
{
  const harness = makeHarness({
    chatReply: "The chart notes per [History of Present Illness]: 'chest pain radiating to the left arm'."
  });
  const reply = await sendRemoteWithApproval(harness, "Summarize the HPI.");
  const { navigations, root } = harness;
  assert.equal(reply.sectionCitations.length, 1, "one citation parsed");
  assert.equal(reply.sectionCitations[0].section, "History of Present Illness");
  assert.equal(reply.sectionCitations[0].quote, "chest pain radiating to the left arm", "quote preserved in metadata");
  assert.equal(reply.sectionCitations[0].pieceId, "admission:s1");
  assert.deepEqual(reply.sectionCitations[0].target, { scope: "context", dayId: null, sectionId: "s1" });
  const rendered = root();
  assert.ok(rendered.includes('data-section-cite="admission:s1"'), "chip carries the piece id");
  assert.ok(rendered.includes('<q class="aic-cite-quote">chest pain radiating to the left arm</q>'),
    "verbatim quote rendered beside the chip");
  clickSectionChip(harness.ctrl, "admission:s1", assistantIndex(harness.ctrl, reply));
  assert.equal(navigations.length, 1, "navigation fired");
  assert.deepEqual(navigations[0], { scope: "context", dayId: null, sectionId: "s1" });
  console.log("ok - citations preserve quotes and navigate");
}

console.log("api: hallucinated citation labels render as inert text, never clickable");
{
  const harness = makeHarness({
    chatReply: "Also per [Nonexistent Section]: 'made up quote'."
  });
  const reply = await sendRemoteWithApproval(harness, "Anything else?");
  const { navigations, root } = harness;
  assert.equal(reply.sectionCitations[0].pieceId, null, "no piece match");
  const rendered = root();
  assert.ok(!rendered.includes('data-section-cite='), "no clickable chip for unmatched labels");
  assert.ok(rendered.includes("made up quote"), "quote text still readable");
  clickSectionChip(harness.ctrl, "", 0);
  assert.equal(navigations.length, 0, "no navigation for unmatched citations");
  console.log("ok - unmatched citations are inert");
}

console.log("api: tool-assisted replies keep section citations and tool records");
{
  const toolReply = "Wells score is 4.5 per [Progress note]: 'stable overnight'.";
  const harness = makeHarness({
    agentStub: {
      runAgent: async () => ({
        text: toolReply,
        toolCalls: [{ toolName: "wells_pe", input: {} }],
        toolResults: [{ toolName: "wells_pe", input: {}, text: "Wells 4.5", deterministic: { score: 4.5 } }]
      })
    }
  });
  const reply = await sendRemoteWithApproval(harness, "What is the Wells score?");
  assert.ok(reply.toolsUsed, "tool mode reply flagged");
  assert.equal(reply.toolRecords.length, 1, "tool record preserved");
  assert.equal(reply.toolRecords[0].toolName, "wells_pe");
  assert.equal(reply.sectionCitations.length, 1, "citation parsed from tool reply");
  assert.equal(reply.sectionCitations[0].section, "Progress note");
  assert.equal(reply.sectionCitations[0].quote, "stable overnight");
  assert.equal(reply.sectionCitations[0].pieceId, "day:d1:c1");
  assert.deepEqual(reply.sectionCitations[0].target, { scope: "daily", dayId: "d1", sectionId: "c1" });
  // Citation click navigates to the hospital-day capture.
  clickSectionChip(harness.ctrl, "day:d1:c1", assistantIndex(harness.ctrl, reply));
  assert.deepEqual(harness.navigations[0], { scope: "daily", dayId: "d1", sectionId: "c1" });
  console.log("ok - tool replies keep citations and tool records");
}

// --- Local mode ------------------------------------------------------------
console.log("local: chat without the model ready falls back — never downloads");
{
  const chatCalls = [];
  const harness = makeHarness({
    ragStub: {
      getRagStatus: async () => ({ ready: false })
    },
    clientStub: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
      chat: async (messages) => { chatCalls.push(messages); return "fallback reply"; },
      resetChat: async () => {},
      onStatusChange: () => {},
      getLocalLlmHardwareReport: async () => ({ recommendation: {} })
    }
  });
  const { ctrl, ragCalls } = harness;
  submitText(ctrl, "What is the diagnosis?");
  await until(() => ctrl.getChatState().messages.some((m) => m.role === "assistant"), "local reply arrived");
  assert.equal(ragCalls.ensureChartIndex, 0, "ordinary chat never triggers a model download");
  assert.equal(ragCalls.warmChartIndex, 0, "no warm fired without a ready model");
  assert.equal(chatCalls.length, 1, "chat still ran on the fallback context");
  const systemMsg = chatCalls[0].find((m) => m.role === "system");
  assert.ok(systemMsg && systemMsg.content.length > 0, "fallback context present");
  console.log("ok - fallback without download");
}

console.log("local: the download affordance is the only route to ensureChartIndex");
{
  const harness = makeHarness({
    ragStub: { getRagStatus: async () => ({ ready: false }) }
  });
  const { ctrl, ragCalls } = harness;
  ctrl.render();
  await until(() => ragCalls.getRagStatus > 0, "status probed");
  assert.equal(ragCalls.ensureChartIndex, 0, "render/status never downloads");
  clickAction(ctrl, "ai-chat-download-rag-model");
  await until(() => ragCalls.ensureChartIndex > 0, "download started");
  console.log("ok - explicit tap is the only download route");
}

console.log("local: ready retrieval supplies section-labelled top-k context");
{
  const chatCalls = [];
  const hits = [
    { n: 1, id: "x#0", pieceId: "day:d1:c1", label: "Progress note", group: "Hospital day 1", text: "Stable overnight.", score: 0.9 }
  ];
  const harness = makeHarness({
    ragStub: {
      getRagStatus: async () => ({ ready: true }),
      retrieveChartChunks: async () => hits
    },
    clientStub: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
      chat: async (messages) => { chatCalls.push(messages); return "grounded reply"; },
      resetChat: async () => {},
      onStatusChange: () => {},
      getLocalLlmHardwareReport: async () => ({ recommendation: {} })
    }
  });
  const { ctrl } = harness;
  submitText(ctrl, "How is the patient doing?");
  await until(() => ctrl.getChatState().messages.some((m) => m.role === "assistant"), "local reply arrived");
  const systemMsg = chatCalls[0].find((m) => m.role === "system");
  assert.ok(systemMsg.content.includes("[Progress note — Hospital day 1]"),
    "retrieved chunk carries its section label");
  assert.ok(systemMsg.content.includes("Stable overnight."), "retrieved text in context");
  console.log("ok - section-labelled retrieval context");
}

console.log("local: patient change during retrieval hard-aborts and preserves the message as a restorable draft");
{
  const chatCalls = [];
  let switchPatient = null;
  const harness = makeHarness({
    ragStub: {
      getRagStatus: async () => ({ ready: true }),
      retrieveChartChunks: async () => {
        // Simulate the patient switch landing mid-retrieval.
        switchPatient();
        return [{ n: 1, id: "x#0", pieceId: "day:d1:c1", label: "Progress note", group: "", text: "x", score: 1 }];
      }
    },
    clientStub: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
      chat: async (messages) => { chatCalls.push(messages); return "should never send"; },
      resetChat: async () => {},
      onStatusChange: () => {},
      getLocalLlmHardwareReport: async () => ({ recommendation: {} })
    }
  });
  const { ctrl, app, statuses, composer } = harness;
  switchPatient = () => { app.vault.activePatientId = "patient-2"; };
  submitText(ctrl, "Unsent question?");
  await until(() => statuses.some((s) => s.includes("Patient changed")), "abort reported");
  assert.equal(chatCalls.length, 0, "generation never started after the switch");
  assert.ok(!ctrl.getChatState().messages.some((m) => m.role === "user"),
    "aborted user message removed from the thread");
  // Durable pending send: initiating patient, generation token, raw text.
  const pending = ctrl.getChatState().pendingSend;
  assert.ok(pending?.aborted, "aborted send preserved as a draft");
  assert.equal(pending.patientId, "patient-1", "draft keyed to the initiating patient");
  assert.equal(pending.message, "Unsent question?", "raw unsent text preserved");
  assert.ok(Number.isInteger(pending.generation), "generation token captured");
  // The new patient's composer must NOT receive the old patient's draft.
  assert.equal(composer.textContent, "", "no restore into another patient's composer");
  // Switching back makes the composer eligible: the draft is restored.
  app.vault.activePatientId = "patient-1";
  ctrl.render();
  assert.equal(composer.textContent, "Unsent question?", "draft restored when the patient's composer is eligible again");
  assert.equal(chatCalls.length, 0, "still no generation against any patient");
  console.log("ok - hard abort preserves a restorable draft");
}

console.log("local: vault lock during retrieval preserves the draft across the lock");
{
  const chatCalls = [];
  let lockVault = null;
  const harness = makeHarness({
    ragStub: {
      getRagStatus: async () => ({ ready: true }),
      retrieveChartChunks: async () => {
        // Simulate the vault locking mid-retrieval.
        lockVault();
        return [];
      }
    },
    clientStub: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
      chat: async (messages) => { chatCalls.push(messages); return "should never send"; },
      resetChat: async () => {},
      onStatusChange: () => {},
      getLocalLlmHardwareReport: async () => ({ recommendation: {} })
    }
  });
  const { ctrl, app, statuses, composer } = harness;
  lockVault = () => { app.vault = null; };
  submitText(ctrl, "Locked question?");
  await until(() => statuses.some((s) => s.includes("Vault locked")), "lock abort reported");
  assert.equal(chatCalls.length, 0, "no generation while the vault is locked");
  const pending = ctrl.getChatState().pendingSend;
  assert.ok(pending?.aborted, "aborted send preserved as a draft");
  assert.equal(pending.patientId, "patient-1", "draft keyed to the initiating patient");
  assert.equal(pending.message, "Locked question?", "raw unsent text preserved");
  assert.equal(composer.textContent, "", "nothing restored while the vault is locked");
  // Unlock with the same patient active: the draft comes back.
  app.vault = { patients: [makePatient()], activePatientId: "patient-1" };
  ctrl.render();
  assert.equal(composer.textContent, "Locked question?", "draft restored after unlock");
  assert.equal(chatCalls.length, 0, "still no generation");
  console.log("ok - draft survives vault lock");
}

console.log("local: debounced warm rebuilds when the chart changes (fingerprint)");
{
  const harness = makeHarness({
    ragStub: { getRagStatus: async () => ({ ready: true }) }
  });
  const { ctrl, app, ragCalls } = harness;
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  let warmCallback = null;
  let clearedCount = 0;
  global.setTimeout = (fn, ms, ...rest) => {
    if (ms === 15000) { warmCallback = fn; return 999; }
    return realSetTimeout(fn, ms, ...rest);
  };
  global.clearTimeout = (id) => { if (id === 999) clearedCount++; return realClearTimeout(id); };
  try {
    ctrl.render();
    await until(() => warmCallback !== null, "warm armed");
    // Rapid edit before the timer fires: the clock restarts for the latest
    // chart, collapsing both edits into one rebuild.
    app.vault.patients[0].contextSections[0].deidentifiedText = "Edited chest pain note.";
    const firstCallback = warmCallback;
    warmCallback = null;
    ctrl.render();
    await until(() => warmCallback !== null && warmCallback !== firstCallback, "warm re-armed after edit");
    assert.ok(clearedCount > 0, "pending warm cancelled when the chart changed");
    await warmCallback();
    await until(() => ragCalls.warmChartIndex > 0, "warm ran");
    assert.equal(ragCalls.warmChartIndex, 1, "rapid edits collapse into one rebuild");
    const ragState = ctrl.getChatState().rag;
    assert.equal(ragState.warmedPatientId, "patient-1", "warmed patient recorded");
    assert.ok(ragState.warmedFingerprint, "warmed fingerprint recorded");
    // A later same-patient content change triggers another rebuild.
    app.vault.patients[0].contextSections[0].deidentifiedText = "Second edit to the note.";
    warmCallback = null;
    ctrl.render();
    await until(() => warmCallback !== null, "warm re-armed after later edit");
    await warmCallback();
    await until(() => ragCalls.warmChartIndex > 1, "second warm ran");
    assert.equal(ragCalls.warmChartIndex, 2, "content change triggers another rebuild");
    // Patient switch cancels the pending warm and clears the warmed record.
    app.vault.patients[0].contextSections[0].deidentifiedText = "Third edit.";
    warmCallback = null;
    ctrl.render();
    await until(() => warmCallback !== null, "warm armed again");
    const staleCallback = warmCallback;
    app.vault.activePatientId = "patient-2";
    ctrl.render();
    await until(() => ctrl.getChatState().rag.warmTimer === null, "pending warm cancelled on switch");
    const switched = ctrl.getChatState().rag;
    assert.equal(switched.warmedPatientId, null, "warmed patient cleared on switch");
    assert.equal(switched.warmedFingerprint, null, "warmed fingerprint cleared on switch");
    await staleCallback();
    assert.equal(ragCalls.warmChartIndex, 2, "stale warm never runs after the switch");
    assert.equal(ragCalls.ensureChartIndex, 0, "warm never routes to the downloading path");
    console.log("ok - fingerprint debounces edits, rebuilds on change, cancels on switch");
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }
}

// --- Service boundary ------------------------------------------------------
console.log("service: explicit-download-only flags are enforced at the boundary");
{
  const svc = await import("../src/rag/rag-service.js?v=20260929-rag-v3");
  assert.ok(svc.ensureChartIndex.toString().includes("allowDownload: true"),
    "ensureChartIndex (explicit tap) may download");
  assert.ok(svc.retrieveChartChunks.toString().includes("allowDownload: false"),
    "retrieveChartChunks (ordinary chat) never downloads");
  assert.ok(svc.warmChartIndex.toString().includes("allowDownload: false"),
    "warmChartIndex never downloads");
  assert.equal(typeof svc.clearPatientIndex, "function", "clearPatientIndex exported");
  console.log("ok - download gate at the service boundary");
}

console.log("service: every index/query/clear operation is serialized through one queue");
{
  const svc = await import("../src/rag/rag-service.js?v=20260929-rag-v3");
  // A patient switch or vault lock must not interleave with an in-flight
  // ensure+query and leave one patient's vectors readable under another
  // patient's id. Every public operation funnels through the single
  // service queue, so they are atomic relative to each other.
  for (const name of ["ensureChartIndex", "retrieveChartChunks", "warmChartIndex", "clearPatientIndex", "clearRagWorkerMemory", "clearAllRagIndexes"]) {
    assert.ok(
      svc[name].toString().includes("enqueueServiceOperation"),
      `${name} runs through the service queue`
    );
  }
  console.log("ok - all service operations serialized");
}

console.log("service: vault lock starts full RAG cleanup before the vault is removed");
{
  // clearSensitiveSession (vault lock / deletion) must begin dropping the
  // in-memory embedding vectors and every cached chart index BEFORE
  // app.vault is discarded — never after. The cleanup is fire-and-forget
  // so lock never waits on it, but it is initiated first.
  const { readFileSync } = await import("node:fs");
  const appSrc = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  const fnStart = appSrc.indexOf("function clearSensitiveSession()");
  assert.ok(fnStart >= 0, "clearSensitiveSession exists");
  const fnBody = appSrc.slice(fnStart, appSrc.indexOf("\n}\n", fnStart));
  const cleanupAt = fnBody.indexOf("clearAllRagIndexes()");
  const vaultNullAt = fnBody.indexOf("app.vault = null");
  assert.ok(cleanupAt >= 0, "lock initiates full RAG cleanup");
  assert.ok(vaultNullAt >= 0, "lock discards the vault");
  assert.ok(cleanupAt < vaultNullAt, "cleanup begins before the vault is removed");
  console.log("ok - lock cleanup ordered before vault removal");
}

console.log("local: retrieval failure racing a patient switch never falls through to generation");
{
  const chatCalls = [];
  let switchPatient = null;
  const harness = makeHarness({
    ragStub: {
      getRagStatus: async () => ({ ready: true }),
      retrieveChartChunks: async () => {
        // The switch lands mid-retrieval and retrieval throws: the
        // post-catch path must recheck the patient explicitly, because the
        // generation token was never invalidated (the chat view's render
        // never ran in this window).
        switchPatient();
        throw new Error("index unavailable");
      }
    },
    clientStub: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "test-model" }),
      chat: async (messages) => { chatCalls.push(messages); return "should never send"; },
      resetChat: async () => {},
      onStatusChange: () => {},
      getLocalLlmHardwareReport: async () => ({ recommendation: {} })
    }
  });
  const { ctrl, app, statuses } = harness;
  switchPatient = () => { app.vault.activePatientId = "patient-2"; };
  submitText(ctrl, "Racing question?");
  await until(() => statuses.some((s) => s.includes("Patient changed")), "abort reported");
  assert.equal(chatCalls.length, 0, "generation never started after the switch, despite the retrieval error");
  assert.ok(!ctrl.getChatState().messages.some((m) => m.role === "user"),
    "aborted user message removed from the thread");
  const pending = ctrl.getChatState().pendingSend;
  assert.ok(pending?.aborted, "aborted send preserved as a draft");
  assert.equal(pending.patientId, "patient-1", "draft keyed to the initiating patient");
  console.log("ok - retrieval-error race aborts before generation");
}

console.log("remote: patient switch during the ChatGPT network await discards the late reply (single-shot)");
{
  let switchPatient = null;
  const harness = makeHarness({
    chatStub: {
      requestOpenAiChat: async () => { throw new Error("unused"); },
      requestOpenAiChatWithUsage: async () => {
        // The switch lands mid-await, clearing the remote thread.
        switchPatient();
        return { text: "Reply for patient-1.", usage: { inputTokens: 10, outputTokens: 5 } };
      }
    }
  });
  const { ctrl, app, statuses } = harness;
  // Single-shot path: the clinical-tools loop is on by default; turn it off.
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-tools-toggle]", checked: false });
  switchPatient = () => { app.vault.activePatientId = "patient-2"; ctrl.render(); };
  clickAction(ctrl, "ai-chat-mode", { mode: "remote" });
  submitText(ctrl, "Switch question?");
  await until(() => {
    const r = ctrl.getRemoteReview();
    return r && r.phase === "ready" ? r : null;
  }, "review ready");
  clickAction(ctrl, "ai-chat-hipaa-accept-all-pending");
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-hipaa-ack]", checked: true });
  clickAction(ctrl, "ai-chat-hipaa-confirm");
  await until(() => statuses.some((m) => m.includes("discarded")), "discard reported");
  const messages = ctrl.getRemoteState().messages;
  assert.ok(!messages.some((m) => m.role === "assistant"),
    "late reply never appended to the new patient's thread");
  assert.ok(!messages.some((m) => m.text === "Reply for patient-1."),
    "patient-1's reply text appears nowhere");
  assert.equal(ctrl.getRemoteState().usage.calls, 0,
    "orphaned usage not recorded against the new patient");
  console.log("ok - single-shot late reply discarded");
}

console.log("remote: patient switch during the tool-loop await discards the late reply");
{
  let switchPatient = null;
  const harness = makeHarness({
    agentStub: {
      runAgent: async () => {
        // The switch lands mid tool-loop, clearing the remote thread.
        switchPatient();
        return { text: "Tool reply for patient-1.", toolCalls: [], toolResults: [], usage: { inputTokens: 10, outputTokens: 5 } };
      }
    }
  });
  const { ctrl, app, statuses } = harness;
  switchPatient = () => { app.vault.activePatientId = "patient-2"; ctrl.render(); };
  clickAction(ctrl, "ai-chat-mode", { mode: "remote" });
  submitText(ctrl, "Tool switch question?");
  await until(() => {
    const r = ctrl.getRemoteReview();
    return r && r.phase === "ready" ? r : null;
  }, "review ready");
  clickAction(ctrl, "ai-chat-hipaa-accept-all-pending");
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-hipaa-ack]", checked: true });
  clickAction(ctrl, "ai-chat-hipaa-confirm");
  await until(() => statuses.some((m) => m.includes("discarded")), "discard reported");
  const messages = ctrl.getRemoteState().messages;
  assert.ok(!messages.some((m) => m.role === "assistant"),
    "late tool reply never appended to the new patient's thread");
  assert.equal(ctrl.getRemoteState().usage.calls, 0,
    "orphaned tool-loop usage not recorded against the new patient");
  console.log("ok - tool-loop late reply discarded");
}

console.log("remote: vault lock during the ChatGPT network await discards the late reply");
{
  let lockVault = null;
  const harness = makeHarness({
    chatStub: {
      requestOpenAiChat: async () => { throw new Error("unused"); },
      requestOpenAiChatWithUsage: async () => {
        // The vault locks mid-await, clearing the remote thread.
        lockVault();
        return { text: "Reply for a locked vault.", usage: { inputTokens: 10, outputTokens: 5 } };
      }
    }
  });
  const { ctrl, app, statuses } = harness;
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-tools-toggle]", checked: false });
  lockVault = () => { app.vault = null; ctrl.render(); };
  clickAction(ctrl, "ai-chat-mode", { mode: "remote" });
  submitText(ctrl, "Lock question?");
  await until(() => {
    const r = ctrl.getRemoteReview();
    return r && r.phase === "ready" ? r : null;
  }, "review ready");
  clickAction(ctrl, "ai-chat-hipaa-accept-all-pending");
  ctrl.change({ matches: (sel) => sel === "[data-ai-chat-hipaa-ack]", checked: true });
  clickAction(ctrl, "ai-chat-hipaa-confirm");
  await until(() => statuses.some((m) => m.includes("discarded")), "discard reported");
  assert.ok(!ctrl.getRemoteState().messages.some((m) => m.role === "assistant"),
    "late reply never appended after the vault locked");
  console.log("ok - vault-lock late reply discarded");
}

console.log("\nAll chart-grounded lifecycle tests passed.");
