// Tests for AI Chat v3:
//   src/ai/remote-chat.js   - service tailoring, rigorous citation system
//                             prompt, Responses-API message assembly
//   src/ui/openai-client.js - requestOpenAiChat (plain-text chat call)
//   src/app/preferences.js  - chatService preference normalization (kept;
//                             AI Chat v3 no longer reads chatService)
//   src/ui/ai-chat/presentation.js - mode segment, remote chat, HIPAA
//                                    review modal (legacy review shape)
//   src/ui/ai-chat/delta-review.js - pure review-gate helpers: hashing,
//                                    context splitting + equivalence,
//                                    redaction records, transmit assembly
//   src/ui/ai-chat/controller.js - review-gate orchestration via the
//                                  deidDeps/chatDeps seams (no DOM)
//
// All fixtures are synthetic and PHI-free.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHAT_SERVICE_OPTIONS,
  buildRemoteChatInput,
  buildRemoteChatSystemPrompt,
  chatServiceOption
} from "../src/ai/remote-chat.js";
import { requestOpenAiChat } from "../src/ui/openai-client.js";
import { DEFAULT_USER_PREFERENCES, chatServiceOption as prefChatServiceOption, normalizeUserPreferences } from "../src/app/preferences.js";
import { createAiChatPresentation } from "../src/ui/ai-chat/presentation.js";
import {
  hashPiece,
  buildContextHeaderText,
  splitBuiltContext,
  verifySplitEquivalence,
  fingerprintPieces,
  entitiesToRedactionRecords,
  applyRedactions,
  locateManualSpan,
  buildTransmitPayload,
  locateTruncation,
  effectiveGuidelinesText
} from "../src/ui/ai-chat/delta-review.js";
import { buildPatientContextFromPieces, MAX_SELECTED_PIECES_CHARS } from "../src/local-llm/patient-context.js";
import { createAiChatController } from "../src/ui/ai-chat/controller.js";
import {
  LONG_CONTEXT_THRESHOLD,
  WEB_SEARCH_COST_PER_CALL,
  OPENAI_MODEL_PRICING,
  pricingForModel,
  costForUsage,
  formatUsd,
  formatTokens
} from "../src/ai/openai-pricing.js";
import { requestOpenAiChatWithUsage } from "../src/ui/openai-client.js";
import { buildCompressionInput } from "../src/ai/remote-chat.js";
import {
  buildChatToolsSystemPrompt,
  CHAT_MAX_STEPS,
  CHAT_TOOL_NAMES,
  CHAT_TOOLS_TAG,
  createChatTools
} from "../src/ui/ai-chat/chat-tools.js";
import { toToolRecord } from "../src/ai/agent-runner.js";


// ---------------------------------------------------------------------------
// remote-chat.js: service options
// ---------------------------------------------------------------------------

assert.ok(CHAT_SERVICE_OPTIONS.length >= 8, "ships a useful set of services");
{
  const values = CHAT_SERVICE_OPTIONS.map((o) => o.value);
  assert.equal(new Set(values).size, values.length, "service values are unique");
  assert.ok(CHAT_SERVICE_OPTIONS.some((o) => o.value === "ob-ld"), "Labor & Delivery service exists");
  for (const o of CHAT_SERVICE_OPTIONS) {
    assert.ok(o.label && o.servicePrompt, `service ${o.value || "general"} has label + prompt`);
  }
}

assert.equal(chatServiceOption("ob-ld").label, "OB/GYN — Labor & Delivery", "service lookup");
assert.equal(chatServiceOption("").value, "", "empty value is the General default");
assert.equal(chatServiceOption("nope").value, "", "unknown value falls back to General");
assert.equal(chatServiceOption(undefined).value, "", "undefined falls back to General");

// ---------------------------------------------------------------------------
// remote-chat.js: rigorous system prompt
// ---------------------------------------------------------------------------

{
  const prompt = buildRemoteChatSystemPrompt({ serviceValue: "ob-ld" });
  assert.ok(prompt.includes("Every medical fact you state MUST be accompanied by a citation"), "citation rule is explicit");
  assert.ok(prompt.includes("Labor & Delivery"), "service is named");
  assert.ok(prompt.includes("ACOG"), "service tailoring mentions the right guideline body");
  assert.ok(prompt.toLowerCase().includes("de-identified"), "PHI rule present");
  assert.ok(prompt.includes("medical student"), "addresses the student");
}

{
  const general = buildRemoteChatSystemPrompt({});
  assert.ok(general.includes("service-agnostic"), "no service => general prompt");
  const medicine = buildRemoteChatSystemPrompt({ serviceValue: "medicine" });
  assert.ok(medicine.includes("internal medicine wards"), "medicine tailoring");
  assert.ok(!medicine.includes("Labor & Delivery"), "service prompts don't leak across services");
}

// ---------------------------------------------------------------------------
// remote-chat.js: message assembly
// ---------------------------------------------------------------------------

{
  const input = buildRemoteChatInput({
    systemPrompt: "SYS",
    history: [
      { role: "user", text: "What is preeclampsia?" },
      { role: "assistant", text: "Preeclampsia is… [ACOG PB 222]" }
    ],
    userMessage: "How is it managed?",
    contextText: "De-identified context here."
  });
  assert.deepEqual(input[0], { role: "system", content: "SYS" }, "system prompt first");
  assert.equal(input[1].role, "user", "history preserved in order");
  assert.equal(input[2].role, "assistant", "assistant history preserved");
  assert.equal(input[3].role, "user", "new message last");
  assert.ok(input[3].content.startsWith("How is it managed?"), "message text leads");
  assert.ok(input[3].content.includes("De-identified context here."), "context appended");
  assert.ok(input[3].content.includes("verified by the student"), "review banner marks the context");
}

{
  const input = buildRemoteChatInput({ systemPrompt: "SYS", userMessage: "Hi" });
  assert.equal(input.length, 2, "no history, no context => two messages");
  assert.equal(input[1].content, "Hi", "bare message sent as typed");
  assert.ok(!input[1].content.includes("patient context"), "no context banner without context");
}

// ---------------------------------------------------------------------------
// openai-client.js: requestOpenAiChat
// ---------------------------------------------------------------------------

function mockFetch(payload, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload
    };
  };
  return { fetchImpl, calls };
}

{
  const { fetchImpl, calls } = mockFetch({ output_text: "Cited answer." });
  const reply = await requestOpenAiChat({
    apiKey: "sk-test",
    model: "gpt-5",
    input: [{ role: "user", content: "Hi" }],
    tools: [{ type: "web_search" }],
    fetchImpl
  });
  assert.equal(reply, "Cited answer.", "returns the reply text");
  assert.equal(calls.length, 1, "one request");
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses", "Responses API endpoint");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-5", "model passed through");
  assert.deepEqual(body.input, [{ role: "user", content: "Hi" }], "input passed through");
  assert.deepEqual(body.tools, [{ type: "web_search" }], "web search tool attached");
  assert.ok(!("text" in body), "no JSON-schema wrapper on plain chat");
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk-test", "Bearer auth");
}

{
  // output[] shape (message content blocks) also parses.
  const { fetchImpl } = mockFetch({
    output: [{ type: "message", content: [{ type: "output_text", text: "From blocks." }] }]
  });
  const reply = await requestOpenAiChat({ apiKey: "sk-test", model: "gpt-5", input: "Hi", fetchImpl });
  assert.equal(reply, "From blocks.", "parses output blocks");
}

await assert.rejects(
  () => requestOpenAiChat({ apiKey: "  ", model: "gpt-5", input: "Hi", fetchImpl: async () => ({}) }),
  /API key/,
  "missing API key fails closed"
);

{
  const { fetchImpl } = mockFetch({ error: { message: "bad key" } }, { status: 401 });
  await assert.rejects(
    () => requestOpenAiChat({ apiKey: "sk-bad", model: "gpt-5", input: "Hi", fetchImpl }),
    /bad key/,
    "API error surfaces the provider message"
  );
}

{
  const { fetchImpl } = mockFetch({ output_text: "   " });
  await assert.rejects(
    () => requestOpenAiChat({ apiKey: "sk-test", model: "gpt-5", input: "Hi", fetchImpl }),
    /empty reply/,
    "empty reply fails closed"
  );
}

{
  // Timeout: fetchImpl rejects with AbortError when the signal fires.
  const fetchImpl = (_url, options) => new Promise((_, reject) => {
    options.signal?.addEventListener("abort", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
  await assert.rejects(
    () => requestOpenAiChat({ apiKey: "sk-test", model: "gpt-5", input: "Hi", fetchImpl, timeoutMs: 20 }),
    /timed out/,
    "timeout produces a friendly error"
  );
}

// ---------------------------------------------------------------------------
// preferences.js: chatService normalization (kept; AI Chat v3 no longer
// reads chatService — the controller builds the system prompt from the
// clinical preferences instead, asserted in the controller tests below)
// ---------------------------------------------------------------------------

assert.equal(DEFAULT_USER_PREFERENCES.chatService, "", "chatService defaults to General");
{
  const normalized = normalizeUserPreferences({ chatService: "ob-ld" });
  assert.equal(normalized.chatService, "ob-ld", "valid service survives normalization");
  assert.equal(normalizeUserPreferences({ chatService: "nope" }).chatService, "", "invalid service resets to General");
  assert.equal(normalizeUserPreferences({}).chatService, "", "missing service defaults to General");
  assert.equal(prefChatServiceOption("icu").label, "ICU / Critical Care", "accessor resolves labels");
}

// ---------------------------------------------------------------------------
// presentation.js: mode segment, remote chat, HIPAA review (legacy shape)
// ---------------------------------------------------------------------------

const presentation = createAiChatPresentation({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  icon: () => ""
});

const base = {
  hardware: { recommendation: { models: [], recommendedKey: null } },
  settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: false },
  llmStatus: { status: "ready", verified: true, activeModelKey: "" },
  chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false },
  downloaded: {},
  patientContext: { enabled: false, available: false, label: "", hasPatient: false },
  contextInspector: null
};

{
  const localBase = {
    ...base,
    hardware: {
      recommendation: {
        models: [{ model: { key: "qwen3-1.7b", label: "Qwen3 1.7B", blurb: "Small, fast." }, available: true }],
        recommendedKey: "qwen3-1.7b"
      }
    }
  };
  const local = presentation.render({ ...localBase, mode: "local", remote: { messages: [], sending: false, webSearch: true, review: null }, hasApiKey: false });
  assert.ok(local.includes("On-device"), "mode segment offers on-device");
  assert.ok(local.includes("ChatGPT"), "mode segment offers ChatGPT");
  assert.ok(local.includes('data-mode="local"'), "mode switch action present");
  assert.ok(local.includes("aic-model"), "local mode renders the model row");
  assert.ok(!local.includes("data-ai-chat-service"), "local mode has no service picker");
  assert.ok(!local.includes("aic-hipaa"), "no HIPAA modal without a review");
}

{
  // AI Chat v3: the controller no longer passes chatService/chatServiceOptions
  // and no longer reads prefs.chatService — the system prompt comes from the
  // clinical preferences (covered by the controller tests below).
  const remote = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [{ role: "user", text: "What is HELLP?" }, { role: "assistant", text: "HELLP is… [ACOG PB 222]" }], sending: false, webSearch: true, review: null },
    hasApiKey: true
  });
  assert.ok(remote.includes('aria-selected="true"'), "ChatGPT tab selected in remote mode");
  assert.ok(remote.includes("data-ai-chat-websearch-toggle"), "web search toggle present");
  assert.ok(remote.includes("What is HELLP?"), "remote messages rendered");
  assert.ok(remote.includes("HELLP is…"), "remote replies rendered");
  assert.ok(remote.includes("data-action=\"ai-chat-revert-remote\""), "remote revert control present");
  assert.ok(remote.includes("data-ai-chat-form"), "remote composer present");
  assert.ok(!remote.includes("aic-modelrow"), "remote mode hides the on-device model row");
  assert.ok(remote.includes("aic-modelwrap"), "remote mode keeps the compact model/options menu (home of the web-search toggle)");
}

{
  const noKey = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: null },
    hasApiKey: false
  });
  assert.ok(noKey.includes("No OpenAI API key saved"), "missing-key warning shown");
}

{
  const review = {
    message: "Summarize this patient's course.",
    messageRedactionTotal: 0,
    messageFlags: [],
    pieces: [
      {
        id: "header",
        title: "Patient header",
        text: "PATIENT: WH Timeline",
        chars: 20,
        redactionTotal: 0,
        counts: {},
        warnings: [],
        flags: []
      },
      {
        id: "day:Hospital Day 7:vitals",
        title: "Vitals flowsheet — Hospital Day 7",
        text: "Seen by [NAME] on [DATE]. Vitals @ [Hospital Day 7 at 19:30]: HRm 80.",
        chars: 68,
        redactionTotal: 3,
        counts: { DATE: 2, NAME: 1 },
        warnings: [],
        flags: []
      },
      {
        id: "day:Hospital Day 7:labs",
        title: "Labs — Hospital Day 7",
        text: "WBC 4.8, Hgb 9.7.",
        chars: 17,
        redactionTotal: 0,
        counts: {},
        warnings: [],
        flags: []
      }
    ],
    redactedContext: "PATIENT: WH Timeline\n\nSeen by [NAME] on [DATE]. Vitals @ [Hospital Day 7 at 19:30]: HRm 80.\n\nWBC 4.8, Hgb 9.7.",
    redactionTotal: 3,
    redactionCounts: { DATE: 2, NAME: 1 },
    residualWarnings: ["possible MRN pattern: 12-34-56"],
    flags: [],
    truncated: false,
    ack: false,
    expanded: ["header", "day:Hospital Day 7:vitals"]
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review },
    hasApiKey: true
  });
  assert.ok(html.includes("aic-hipaa-backdrop"), "HIPAA review modal rendered");
  assert.ok(html.includes("Review before sending to ChatGPT"), "modal title");
  assert.ok(html.includes("Nothing has been sent yet"), "explicit no-send-yet statement");
  assert.ok(html.includes("1 message"), "message stat card");
  assert.ok(html.includes("3 documents"), "context stat card counts pieces");
  assert.ok(html.includes("3 applied"), "redaction stat card");
  assert.ok(html.includes("1 to check"), "warning stat card");
  assert.ok(html.includes("Summarize this patient&#x27;s course.") || html.includes("Summarize this patient"), "message shown");
  assert.ok(html.includes("Patient header"), "header piece title shown");
  assert.ok(html.includes("Vitals flowsheet — Hospital Day 7"), "expanded piece title shown");
  assert.ok(html.includes("Labs — Hospital Day 7"), "collapsed piece title shown");
  assert.ok(html.includes("DATE × 2"), "per-piece redaction chips shown");
  assert.ok(html.includes("aic-hipaa-mark"), "redaction markers highlighted");
  assert.ok(html.includes("[Hospital Day 7 at 19:30]"), "relative-timeline conversion visible");
  assert.ok(!html.includes("WBC 4.8"), "collapsed piece body not rendered");
  assert.ok(html.includes("Review flags"), "flags card shown");
  assert.ok(html.includes("possible MRN pattern"), "residual warnings shown");
  assert.ok(html.includes("data-ai-chat-hipaa-ack"), "review ack checkbox present");
  assert.ok(html.includes("ai-chat-hipaa-confirm"), "confirm action present");
  assert.ok(html.includes('data-action="ai-chat-hipaa-confirm" disabled'), "send disabled until the student acks review");
  assert.ok(html.includes("ai-chat-hipaa-cancel"), "cancel action present");
  assert.ok(html.includes('data-action="ai-chat-hipaa-piece"'), "piece expand/collapse present");
}

{
  // Acked review: the send button enables.
  const acked = {
    message: "hi",
    messageRedactionTotal: 0,
    messageFlags: [],
    pieces: [{ id: "header", title: "Patient header", text: "PATIENT: WH Timeline", chars: 20, redactionTotal: 0, counts: {}, warnings: [], flags: [] }],
    redactedContext: "PATIENT: WH Timeline",
    redactionTotal: 0,
    redactionCounts: {},
    residualWarnings: [],
    flags: ["No PHI spans detected. Review still required."],
    truncated: false,
    ack: true,
    canSend: true,
    expanded: ["header"]
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: acked },
    hasApiKey: true
  });
  assert.ok(html.includes('data-action="ai-chat-hipaa-confirm">'), "send enabled after ack");
  assert.ok(html.includes('data-ai-chat-hipaa-ack checked'), "ack checkbox reflects state");
}

{
  // v4 piece-record contract: pieces carry modelRecords/manualRecords with
  // { id, start, end, originalText, replacement, label, source, status } and
  // the presentation must surface pending suggestions (Accept/Reject) and
  // reviewed rows (Undo/Restore) from them. Regression test: the v4
  // presentation initially read piece.pending/piece.reviewed, which the
  // controller never emits, so every suggestion row silently vanished.
  const review = {
    phase: "ready",
    messageTransformed: "Summarize the course.",
    messageCounts: {},
    messageFlags: [],
    pieces: [
      {
        id: "day:Hospital Day 7:vitals",
        title: "Vitals flowsheet — Hospital Day 7",
        badge: "new",
        approvedText: "Seen by [NAME] on [DATE].",
        chars: 25,
        redactionTotal: 3,
        counts: { NAME: 1, DATE: 1, MANUAL: 1 },
        warnings: [],
        flags: [],
        truncated: false,
        modelRecords: [
          { id: "r1", start: 8, end: 16, originalText: "Mona Kraus", replacement: "[NAME]", label: "NAME", source: "model", status: "pending" },
          { id: "r2", start: 20, end: 30, originalText: "03/14/2026", replacement: "[DATE]", label: "DATE", source: "model", status: "accepted" },
          { id: "r3", start: 31, end: 38, originalText: "Springfield", replacement: "[LOCATION]", label: "LOCATION", source: "model", status: "rejected" }
        ],
        manualRecords: [
          { id: "m1", start: 0, end: 4, originalText: "Room 4", replacement: "[REDACTED]", label: "MANUAL", source: "manual", status: "accepted" }
        ]
      }
    ],
    guidelines: null,
    history: [],
    transmitText: "Seen by [NAME] on [DATE].",
    systemPromptText: "sys",
    redactionTotal: 3,
    redactionCounts: { NAME: 1, DATE: 1, MANUAL: 1 },
    residualWarnings: [],
    flags: [],
    truncationNote: "",
    expanded: ["day:Hospital Day 7:vitals"],
    reviewedOpen: ["day:Hospital Day 7:vitals"],
    ack: false,
    canSend: false
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review },
    hasApiKey: true
  });
  assert.ok(html.includes("New suggestions"), "pending suggestions section rendered from modelRecords");
  assert.ok(html.includes("Mona Kraus"), "pending record original text shown (originalText contract field)");
  assert.ok(html.includes('data-action="ai-chat-hipaa-accept" data-piece="day:Hospital Day 7:vitals" data-redaction="r1"'), "pending record has Accept targeting the record id");
  assert.ok(html.includes('data-action="ai-chat-hipaa-reject" data-piece="day:Hospital Day 7:vitals" data-redaction="r1"'), "pending record has Reject targeting the record id");
  assert.ok(html.includes("Already reviewed"), "reviewed section rendered from accepted/rejected records");
  assert.ok(html.includes("03/14/2026"), "accepted model record shown in the reviewed list");
  assert.ok(html.includes("Room 4"), "accepted manual record shown in the reviewed list");
  assert.ok(html.includes('data-action="ai-chat-hipaa-undo"'), "accepted records offer Undo");
  assert.ok(html.includes('data-action="ai-chat-hipaa-restore"'), "rejected records offer Restore");
  assert.ok(html.includes('data-action="ai-chat-hipaa-restore" data-piece="day:Hospital Day 7:vitals" data-redaction="r3"'), "rejected record offers Restore targeting its record id");
}

{
  // Failed de-identification: fail-closed error state, no content, no send.
  const failed = {
    message: "should not appear",
    messageRedactionTotal: 0,
    messageFlags: [],
    pieces: [{ id: "p1", title: "Doc", text: "SECRET-CONTEXT", chars: 14, redactionTotal: 0, counts: {}, warnings: [], flags: [] }],
    redactedContext: "SECRET-CONTEXT",
    redactionTotal: 0,
    redactionCounts: {},
    residualWarnings: [],
    flags: [],
    truncated: false,
    failed: true,
    failedDetail: "Context de-identification failed (boom) — nothing was sent.",
    ack: false,
    expanded: []
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: failed },
    hasApiKey: true
  });
  assert.ok(html.includes("sending is blocked"), "fail-closed error state rendered");
  assert.ok(html.includes("nothing was sent"), "failure detail shown");
  assert.ok(!html.includes("SECRET-CONTEXT"), "no context text shown on failure");
  assert.ok(!html.includes("should not appear"), "no message text shown on failure");
  assert.ok(!html.includes("ai-chat-hipaa-confirm"), "no send button on failure");
  assert.ok(!html.includes("data-ai-chat-hipaa-ack"), "no ack checkbox on failure");
  assert.ok(html.includes("ai-chat-hipaa-cancel"), "close action still present on failure");
}

{
  // Multiple expanded pieces all render their bodies (auto-expanded flagged docs).
  const multi = {
    message: "hi",
    messageRedactionTotal: 0,
    messageFlags: [],
    pieces: [
      { id: "p1", title: "Doc one", text: "alpha [NAME]", chars: 12, redactionTotal: 1, counts: { NAME: 1 }, warnings: [], flags: [] },
      { id: "p2", title: "Doc two", text: "beta [DATE]", chars: 11, redactionTotal: 1, counts: { DATE: 1 }, warnings: [], flags: [] },
      { id: "p3", title: "Doc three", text: "gamma plain", chars: 11, redactionTotal: 0, counts: {}, warnings: [], flags: [] }
    ],
    redactedContext: "x",
    redactionTotal: 2,
    redactionCounts: { NAME: 1, DATE: 1 },
    residualWarnings: [],
    flags: [],
    truncated: false,
    ack: false,
    expanded: ["p1", "p2"]
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: multi },
    hasApiKey: true
  });
  assert.ok(html.includes('aria-expanded="true"'), "expanded pieces marked open");
  const openCount = html.split('aria-expanded="true"').length - 1;
  assert.equal(openCount, 2, "exactly the two flagged pieces open");
}

// ---------------------------------------------------------------------------
// delta-review.js: pure review-gate helpers
// ---------------------------------------------------------------------------

function reviewFixturePatient() {
  return {
    id: "patient-1",
    displayLabel: "WH Timeline",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { id: "hpi", label: "History of present illness", sourceKind: "primary_note", deidentifiedText: "55-year-old with chest pain." },
      { id: "pmh", label: "Past medical history", sourceKind: "history", deidentifiedText: "Hypertension, diabetes." }
    ],
    days: [
      {
        id: "day1",
        label: "Hospital Day 1",
        date: "2026-09-20",
        sourceCaptures: [
          { id: "vitals", label: "Vitals flowsheet", sourceKind: "vitals", deidentifiedText: "HR 80, BP 120/80." }
        ],
        quickNotes: ["Resting comfortably overnight."]
      },
      {
        id: "day2",
        label: "Hospital Day 2",
        date: "2026-09-21",
        sourceCaptures: [],
        quickNotes: ["Ambulating with PT."]
      }
    ]
  };
}

{
  // hashPiece: deterministic, hex, avalanche on input change.
  const a = hashPiece("abc");
  assert.equal(a, hashPiece("abc"), "hash is deterministic");
  assert.ok(/^[0-9a-f]+$/.test(a), "hash is hex");
  assert.notEqual(a, hashPiece("abd"), "hash changes with input");
  assert.notEqual(a, hashPiece(""), "empty string hashes distinctly");
}

{
  // buildContextHeaderText matches the trusted builder's header exactly.
  const patient = reviewFixturePatient();
  const header = buildContextHeaderText(patient);
  const built = buildPatientContextFromPieces(patient, ["admission:hpi"], { draftNoteText: "" });
  assert.ok(built.startsWith(header + "\n\n"), "header is a byte-exact prefix of the trusted assembly");
  assert.equal(header, "PATIENT: WH Timeline\nAdmitted: 2026-09-20", "header format");
  assert.equal(buildContextHeaderText(null), "PATIENT: Active patient", "null patient header");
}

{
  // effectiveGuidelinesText: custom text wins, blank falls back to default.
  assert.equal(effectiveGuidelinesText({ systemGuidelines: "  custom  " }), "custom", "custom guidelines used");
  assert.ok(effectiveGuidelinesText({ systemGuidelines: "   " }).length > 0, "blank falls back to default");
  assert.ok(effectiveGuidelinesText({}).length > 0, "missing falls back to default");
}

{
  // split + equivalence: admission sections, in listPatientContextPieces order.
  const patient = reviewFixturePatient();
  const ids = ["admission:hpi", "admission:pmh"];
  const split = splitBuiltContext(patient, ids, { draftNoteText: "" });
  assert.deepEqual(split.pieces.map((p) => p.id), ids, "split preserves piece order");
  assert.ok(verifySplitEquivalence(patient, ids, split, { draftNoteText: "" }), "split verifies against the trusted builder");
  const fps = fingerprintPieces(split);
  assert.equal(fps.length, 2, "one fingerprint per piece");
  assert.ok(fps.every((f) => f.contentHash === hashPiece(split.pieces.find((p) => p.id === f.id).rawText)), "fingerprints hash the raw text");
}

{
  // Hospital days: captures and quick notes split in order.
  const patient = reviewFixturePatient();
  const ids = ["day:day1:vitals", "day:day1:quicknotes", "day:day2:quicknotes"];
  const split = splitBuiltContext(patient, ids, { draftNoteText: "" });
  assert.deepEqual(split.pieces.map((p) => p.id), ids, "day pieces in order");
  assert.ok(split.pieces[0].rawText.includes("HR 80"), "capture text present");
  assert.ok(split.pieces[1].rawText.includes("Resting comfortably"), "quick notes present");
  assert.ok(verifySplitEquivalence(patient, ids, split, { draftNoteText: "" }), "day split verifies");
}

{
  // Draft note piece.
  const patient = reviewFixturePatient();
  const draft = "Assessment: stable for discharge.";
  const ids = ["draft:current"];
  const split = splitBuiltContext(patient, ids, { draftNoteText: draft });
  assert.equal(split.pieces.length, 1, "draft piece splits");
  assert.ok(split.pieces[0].rawText.includes("stable for discharge"), "draft text present");
  assert.ok(verifySplitEquivalence(patient, ids, split, { draftNoteText: draft }), "draft split verifies");
}

{
  // Empty selection and stale ids: both sides agree on "".
  const patient = reviewFixturePatient();
  const empty = splitBuiltContext(patient, [], { draftNoteText: "" });
  assert.equal(empty.pieces.length, 0, "no pieces for empty selection");
  assert.ok(verifySplitEquivalence(patient, [], empty, { draftNoteText: "" }), "empty selection verifies");
  const stale = splitBuiltContext(patient, ["nope", "admission:hpi", "stale:1"], { draftNoteText: "" });
  assert.deepEqual(stale.pieces.map((p) => p.id), ["admission:hpi"], "stale ids dropped");
  assert.ok(verifySplitEquivalence(patient, ["nope", "admission:hpi", "stale:1"], stale, { draftNoteText: "" }), "stale ids verify");
}

{
  // Forced truncation: both sides apply the same budget cut.
  const patient = reviewFixturePatient();
  patient.contextSections[0].deidentifiedText = "Note. ".repeat(120); // ~720 chars, over the 500-char budget floor
  const ids = ["admission:hpi", "admission:pmh", "day:day1:vitals"];
  const split = splitBuiltContext(patient, ids, { draftNoteText: "", maxChars: 500 });
  assert.equal(split.maxChars, 500, "minimum budget honored");
  assert.ok(verifySplitEquivalence(patient, ids, split, { draftNoteText: "", maxChars: 500 }), "truncated split verifies");
  const full = buildPatientContextFromPieces(patient, ids, { draftNoteText: "" });
  assert.ok(full.length > 500, "fixture exceeds the forced budget");
  assert.ok(buildPatientContextFromPieces(patient, ids, { draftNoteText: "", maxChars: 500 }).endsWith("..."), "trusted builder truncates");
}

{
  // Tampering with a split fails the equivalence check.
  const patient = reviewFixturePatient();
  const ids = ["admission:hpi"];
  const split = splitBuiltContext(patient, ids, { draftNoteText: "" });
  split.pieces[0].rawText += " tampered";
  assert.equal(verifySplitEquivalence(patient, ids, split, { draftNoteText: "" }), false, "tampered split fails");
  assert.equal(verifySplitEquivalence(patient, ids, null, { draftNoteText: "" }), false, "null split fails");
}

{
  // entitiesToRedactionRecords: pending records with ground-truth spans.
  const text = "Call CanaryName at 555-0100.";
  const records = entitiesToRedactionRecords(text, [
    { start: 5, end: 15, label: "NAME", renderedPlaceholder: "[NAME]" },
    { start: 19, end: 27, label: "PHONE", placeholder: "[PHONE]" },
    { start: -1, end: 2, label: "BAD" },
    { start: 3, end: 3, label: "EMPTY" },
    { start: 0, end: 999, label: "LONG" }
  ]);
  assert.equal(records.length, 2, "invalid spans skipped");
  assert.deepEqual(records[0], {
    id: "model:5:15",
    start: 5,
    end: 15,
    originalText: "CanaryName",
    replacement: "[NAME]",
    label: "NAME",
    source: "model",
    status: "pending"
  }, "record shape");
  assert.equal(records[1].replacement, "[PHONE]", "placeholder fallback used");
}

{
  // applyRedactions: model records render, rejected records drop, and the
  // student's manual "[REDACTED]" marker survives the trusted renderer
  // (which derives markers from labels, not explicit placeholders).
  const text = "Seen by CanaryName. ManualTarget asked for water.";
  const nameStart = text.indexOf("CanaryName");
  const manualStart = text.indexOf("ManualTarget");
  const records = [
    { id: "model:1", start: nameStart, end: nameStart + 10, originalText: "CanaryName", replacement: "[NAME]", label: "NAME", source: "model", status: "accepted" },
    { id: "manual:1", start: manualStart, end: manualStart + 12, originalText: "ManualTarget", replacement: "[REDACTED]", label: "MANUAL", source: "manual", status: "accepted" }
  ];
  const out = applyRedactions(text, records, null);
  assert.ok(!out.includes("CanaryName"), "model span redacted");
  assert.ok(out.includes("[REDACTED]"), "manual marker persists exactly");
  assert.ok(!out.includes("ManualTarget"), "manual span redacted");
  // Rejected records are dropped from the approved text.
  const rejected = applyRedactions(text, records.map((r) => ({ ...r, status: "rejected" })), null);
  assert.equal(rejected, text, "all-rejected => raw text unchanged");
  // Empty record list => raw text unchanged (modulo the renderer's own
  // passes, which find nothing date-like in this text).
  assert.equal(applyRedactions(text, [], null), text, "no records => unchanged");
}

{
  // locateManualSpan: unique / ambiguous / overlapping / not-found / empty.
  const text = "Alpha Beta Gamma Beta";
  assert.deepEqual(locateManualSpan(text, "Alpha", []), { ok: true, start: 0, end: 5 }, "unique span located");
  assert.deepEqual(locateManualSpan(text, "Beta", []).ok, false, "ambiguous fails");
  assert.equal(locateManualSpan(text, "Beta", []).reason, "ambiguous", "ambiguous reason");
  assert.equal(locateManualSpan(text, "Zeta", []).reason, "not-found", "not-found reason");
  assert.equal(locateManualSpan(text, "", []).reason, "empty", "empty reason");
  assert.equal(locateManualSpan(text, "Alpha", [{ start: 0, end: 5 }]).reason, "overlapping", "overlapping reason");
  // A repeated span with one occurrence free still locates.
  const located = locateManualSpan(text, "Beta", [{ start: 6, end: 10 }]);
  assert.ok(located.ok && located.start === 17, "second occurrence located when first is occupied");
}

{
  // buildTransmitPayload: order, separators, budget cut, real wire format.
  const approvedById = {
    header: "PATIENT: WH Timeline",
    a: "piece A text",
    b: "piece B text"
  };
  const payload = buildTransmitPayload({
    approvedById,
    pieceOrder: ["header", "a", "b"],
    transformedMessage: "Summarize.",
    systemPrompt: "SYS",
    history: [{ role: "user", text: "earlier" }]
  });
  assert.equal(payload.contextText, "PATIENT: WH Timeline\n\npiece A text\n\npiece B text", "order + separators");
  const input = payload.input;
  assert.deepEqual(input[0], { role: "system", content: "SYS" }, "system first");
  assert.equal(input[input.length - 1].role, "user", "final message is the user turn");
  assert.equal(payload.finalUserContent, input[input.length - 1].content, "finalUserContent is the wire content");
  assert.ok(payload.finalUserContent.startsWith("Summarize."), "transformed message leads");
  assert.ok(payload.finalUserContent.includes("piece B text"), "context appended");
  assert.ok(payload.finalUserContent.includes("verified by the student"), "review banner present");
  // Budget cut: the tail is cut from the joined context, like the builder.
  const big = buildTransmitPayload({
    approvedById: { a: "x".repeat(400), b: "y".repeat(400) },
    pieceOrder: ["a", "b"],
    transformedMessage: "Hi",
    systemPrompt: "SYS",
    maxChars: 500
  });
  assert.ok(big.contextText.length <= 500, "context honors the budget");
  assert.ok(big.contextText.endsWith("..."), "budget cut marked");
}

{
  // locateTruncation: pinpoints the cut piece.
  const noCut = locateTruncation(["a", "b"], { a: "short", b: "shorter" }, 6000);
  assert.equal(noCut.truncated, false, "no truncation under budget");
  assert.equal(noCut.cutPieceId, null, "no cut piece");
  const cut = locateTruncation(["a", "b"], { a: "x".repeat(400), b: "y".repeat(400) }, 500);
  assert.equal(cut.truncated, true, "truncation detected");
  assert.equal(cut.cutPieceId, "b", "cut lands in the second piece");
  assert.ok(cut.cutOffsetInPiece > 0, "cut offset reported");
}

// ---------------------------------------------------------------------------
// controller.js: review-gate orchestration via the deidDeps/chatDeps seams
// ---------------------------------------------------------------------------

function controllerFixturePatient() {
  return {
    id: "patient-1",
    displayLabel: "WH Timeline",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { id: "hpi", label: "History of present illness", sourceKind: "primary_note", deidentifiedText: "Patient CanaryName presents with chest pain. ManualTarget was mentioned by family." },
      { id: "pmh", label: "Past medical history", sourceKind: "history", deidentifiedText: "Hypertension and diabetes." }
    ],
    days: [
      {
        id: "day1",
        label: "Hospital Day 1",
        date: "2026-09-20",
        sourceCaptures: [
          { id: "vitals", label: "Vitals flowsheet", sourceKind: "vitals", deidentifiedText: "HR 80, BP 120/80." }
        ],
        quickNotes: ["Overnight: CanaryName resting comfortably."]
      }
    ]
  };
}

// De-id stub: deterministic, PHI-free. Emits one NAME entity per CanaryName
// occurrence and returns the text with the canary replaced.
function makeDeidStub({ throwOn } = {}) {
  const calls = [];
  const verifyCalls = [];
  let ready = true;
  let verifyImpl = null;
  return {
    calls,
    verifyCalls,
    STRUCTURED_DEID_MODE: "structured",
    setReady: (value) => { ready = value; },
    setVerifyImpl: (fn) => { verifyImpl = fn; },
    getSelectedDeidModelStatus: (key) => ({ ready, modelKey: key, label: "Stub de-id model" }),
    getAdvancedDeidStatus: () => ({ label: "Stub de-id model" }),
    crossOriginIsolationBlocker: () => "",
    verifyAdvancedDeidModel: async (options) => {
      verifyCalls.push(options);
      if (verifyImpl) await verifyImpl(options);
      else ready = true;
    },
    preloadAdvancedDeidModel: async () => ({}),
    deidentifyText: async (rawText, opts) => {
      const text = String(rawText);
      calls.push({ rawText: text, mode: opts?.mode });
      if (throwOn && throwOn(text)) throw new Error("deid boom");
      const entities = [];
      for (const m of text.matchAll(/CanaryName/g)) {
        entities.push({ start: m.index, end: m.index + "CanaryName".length, label: "NAME", renderedPlaceholder: "[NAME]", source: "model" });
      }
      return {
        text: text.replace(/CanaryName/g, "[NAME]"),
        redactionTotal: entities.length,
        counts: entities.length ? { NAME: entities.length } : {},
        residualWarnings: [],
        flags: ["Model: stub"],
        entities,
        modelId: "stub-model",
        modelChunkFailures: 0
      };
    }
  };
}

function makeChatStub() {
  const calls = [];
  return {
    calls,
    requestOpenAiChat: async ({ input }) => {
      calls.push({ input });
      return "Cited reply. [Stub]";
    }
  };
}

function makeAgentStub({ throwOnRun = false } = {}) {
  const calls = [];
  return {
    calls,
    runAgent: async (args) => {
      calls.push(args);
      if (throwOnRun) throw new Error("network down");
      return {
        text: "Tool-mode reply. [Stub]",
        toolCalls: [
          { step: 1, toolName: "list_clinical_calculators", input: {} },
          { step: 2, toolName: "run_clinical_calculator", input: { calculatorId: "chadsvasc", inputs: {} } }
        ],
        toolResults: [
          { step: 1, toolName: "list_clinical_calculators", input: {}, text: "25 calculators", deterministic: { kind: "calculator-list", count: 25 } },
          { step: 2, toolName: "run_clinical_calculator", input: { calculatorId: "chadsvasc" }, text: "CHA2DS2-VASc: incomplete", deterministic: { kind: "calculator-run", complete: false, missing: ["age"] } }
        ],
        deterministicFindings: [],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: "stop"
      };
    }
  };
}

function setToolsToggle(h, checked) {
  h.ctrl.change({ matches: (sel) => sel === "[data-ai-chat-tools-toggle]", checked });
}

function makeHarness({ patient = controllerFixturePatient(), prefs = {}, deidStub = makeDeidStub(), chatStub = makeChatStub(), agentStub = makeAgentStub(), draftText = "" } = {}) {
  const statuses = [];
  let html = "";
  const root = {};
  Object.defineProperty(root, "innerHTML", {
    get: () => html,
    set: (v) => { html = String(v); },
    configurable: true
  });
  let composerValue = "";
  const composerInput = {
    get value() { return composerValue; },
    set value(v) { composerValue = String(v); },
    textContent: ""
  };
  root.querySelector = (sel) => (sel === "[data-ai-chat-input]" ? composerInput : null);
  const vault = { patients: [patient], activePatientId: patient.id };
  const app = { view: "aiChat", vault, deidMode: "stub-model" };
  let ctrl;
  ctrl = createAiChatController({
    app,
    byId: (id) => (id === "aiChatContent" ? root : null),
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => "",
    setStatus: (m) => statuses.push(String(m)),
    render: () => { ctrl.render(); },
    getDraftNoteText: () => draftText,
    currentPreferences: () => ({ openAiApiKey: "sk-test", openAiModel: "gpt-5.4-mini", medicalService: "medicine", ...prefs }),
    onChatServiceChange: () => {},
    deidDeps: deidStub,
    chatDeps: chatStub,
    agentDeps: agentStub
  });
  // The review gate lives on the ChatGPT (remote) tab.
  ctrl.click(actionTarget("ai-chat-mode", { mode: "remote" }));
  return {
    ctrl, app, statuses, deidStub, chatStub, agentStub, composerInput,
    html: () => html,
    setDraft: (t) => { draftText = t; }
  };
}

function actionTarget(action, dataset = {}) {
  const el = {
    dataset: { action, ...dataset },
    closest: (sel) => (sel === "[data-action]" ? el : null)
  };
  return el;
}

function sendRemoteAction(message) {
  const input = { value: message };
  const form = { querySelector: (sel) => (sel === "[data-ai-chat-input]" ? input : null) };
  const btn = actionTarget("ai-chat-send-remote");
  btn.closest = (sel) => {
    if (sel === "[data-action]") return btn;
    if (sel === "[data-ai-chat-form]") return form;
    return null;
  };
  return btn;
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

async function driveSend(h, message) {
  h.ctrl.click(sendRemoteAction(message));
  const start = Date.now();
  for (;;) {
    const review = h.ctrl.getRemoteReview();
    if (review && (review.phase === "ready" || review.phase === "failed")) return review;
    if (Date.now() - start > 5000) throw new Error("timed out waiting for the review gate");
    await tick();
  }
}

function acceptAllAndAck(h) {
  const review = h.ctrl.getRemoteReview();
  assert.equal(review.phase, "ready", "review is ready before accepting");
  for (const piece of [review.guidelines, ...review.pieces]) {
    h.ctrl.click(actionTarget("ai-chat-hipaa-accept-all", { piece: piece.id }));
  }
  h.ctrl.change({ matches: (sel) => sel === "[data-ai-chat-hipaa-ack]", checked: true });
}

async function confirmSend(h) {
  const beforeChat = h.chatStub.calls.length;
  const beforeAgent = h.agentStub.calls.length;
  h.ctrl.click(actionTarget("ai-chat-hipaa-confirm"));
  const start = Date.now();
  while (h.chatStub.calls.length === beforeChat && h.agentStub.calls.length === beforeAgent && Date.now() - start < 5000) await tick();
  await tick(30);
  return h.chatStub.calls.length > beforeChat || h.agentStub.calls.length > beforeAgent;
}

{
  // (1) A de-identification throw fails closed: failed phase, no OpenAI
  // call, no raw text anywhere in the rendered output.
  const deidStub = makeDeidStub({ throwOn: () => true });
  const chatStub = makeChatStub();
  const h = makeHarness({ deidStub, chatStub });
  const review = await driveSend(h, "Summarize CanaryName for me");
  assert.equal(review.phase, "failed", "de-id throw => failed phase");
  assert.ok(review.failedDetail.includes("nothing was sent"), "fail-closed detail");
  assert.equal(chatStub.calls.length, 0, "OpenAI never called");
  assert.ok(!h.html().includes("CanaryName"), "raw canary never rendered");
  assert.equal(review.ack, false, "no acknowledgement on failure");
  assert.equal(review.canSend, false, "cannot send from a failed review");
}

{
  // A throw on a context piece (not the message) also fails closed.
  // "ManualTarget" appears only in the HPI chart piece, never in the message.
  const deidStub = makeDeidStub({ throwOn: (t) => t.includes("ManualTarget") });
  const chatStub = makeChatStub();
  const h = makeHarness({ deidStub, chatStub });
  const review = await driveSend(h, "Q CanaryName");
  assert.equal(review.phase, "failed", "piece de-id throw => failed phase");
  assert.equal(chatStub.calls.length, 0, "OpenAI never called");
  assert.ok(!h.html().includes("CanaryName"), "no canary leaked");
}

{
  // An unusable de-id result (no model id) fails closed like a throw.
  const deidStub = makeDeidStub();
  const orig = deidStub.deidentifyText;
  deidStub.deidentifyText = async (t, o) => ({ ...(await orig(t, o)), modelId: "" });
  const chatStub = makeChatStub();
  const h = makeHarness({ deidStub, chatStub });
  const review = await driveSend(h, "Q CanaryName");
  assert.equal(review.phase, "failed", "invalid result => failed phase");
  assert.equal(chatStub.calls.length, 0, "OpenAI never called");
}

{
  // (2) Happy path, tools OFF: what was reviewed is what is sent. The
  // captured input's final user content equals the review's
  // finalUserContent, contains the reviewed transmit text, and leads with
  // the transformed message. Only the inspector-selected pieces go through
  // the review gate — the de-identification review is the consent point
  // for exactly the selection.
  const h = makeHarness();
  setToolsToggle(h, false);
  // Select the full chart: the default selection is the primary piece only.
  for (const id of ["admission:pmh", "day:day1:vitals", "day:day1:quicknotes"]) {
    h.ctrl.change({
      matches: (sel) => sel === "[data-ai-chat-context-piece]",
      dataset: { aiChatContextPiece: id },
      checked: true
    });
  }
  const review = await driveSend(h, "Summarize CanaryName for me");
  assert.equal(review.phase, "ready", "review ready");
  assert.ok(!review.messageTransformed.includes("CanaryName"), "message transformed");
  assert.ok(review.messageTransformed.includes("[NAME]"), "message redaction visible");
  assert.equal(h.deidStub.calls.length, 7, "message + guidelines + header + selected chart (4 pieces) de-identified");
  assert.ok(review.pieces.some((p) => p.id === "header"), "header reviewed");
  assert.equal(review.pieces.length, 5, "header + all four selected chart pieces reviewed");
  acceptAllAndAck(h);
  const pre = h.ctrl.getRemoteReview();
  assert.equal(pre.canSend, true, "ack + zero pending => canSend");
  const sent = await confirmSend(h);
  assert.equal(sent, true, "send happened");
  assert.equal(h.chatStub.calls.length, 1, "one OpenAI call");
  const input = h.chatStub.calls[0].input;
  const lastContent = input[input.length - 1].content;
  assert.equal(lastContent, pre.transmit.finalUserContent, "sent content is the reviewed finalUserContent");
  assert.ok(lastContent.includes(pre.transmitText), "reviewed transmit text is in the payload");
  assert.ok(lastContent.startsWith(pre.messageTransformed), "transformed message leads the payload");
  assert.equal(input[0].content, pre.systemPromptText, "sent system prompt is the reviewed one");
  assert.ok(!lastContent.includes("CanaryName"), "no raw canary in the payload");
  // (10) History stores the transformed strings.
  const htmlAfter = h.html();
  assert.ok(htmlAfter.includes("[NAME]"), "transformed message in history");
  assert.ok(!htmlAfter.includes("CanaryName"), "raw canary not in rendered history");
}

{
  // (3) Confirm without acknowledgement does not send.
  const h = makeHarness();
  await driveSend(h, "Hi CanaryName");
  const review = h.ctrl.getRemoteReview();
  for (const piece of [review.guidelines, ...review.pieces]) {
    h.ctrl.click(actionTarget("ai-chat-hipaa-accept-all", { piece: piece.id }));
  }
  const sent = await confirmSend(h);
  assert.equal(sent, false, "no send without ack");
  assert.ok(h.ctrl.getRemoteReview(), "review still open");
  assert.ok(h.statuses.some((s) => s.includes("acknowledgement")), "status explains the block");
}

{
  // (4) De-id model not ready: the send auto-loads and verifies the best
  // system instead of refusing — no manual download step.
  const deidStub = makeDeidStub();
  deidStub.setReady(false);
  const h = makeHarness({ deidStub });
  const review = await driveSend(h, "Hi");
  assert.equal(review.phase, "ready", "review opened after the automatic load");
  assert.ok(deidStub.verifyCalls.length >= 1, "the best de-id system was verified automatically");
  assert.ok(deidStub.calls.length > 0, "de-identification ran after the automatic load");
  assert.ok(!h.statuses.some((s) => s.includes("nothing was sent")), "nothing failed closed");
}

{
  // Structured-only de-id mode no longer blocks ChatGPT sends: AI Chat
  // always uses the best system, loaded automatically.
  const h = makeHarness();
  h.app.deidMode = "structured";
  const review = await driveSend(h, "Hi");
  assert.equal(review.phase, "ready", "review opened despite the structured mode setting");
  assert.ok(h.deidStub.calls.length > 0, "de-identification ran");
}

{
  // (6) Resend reuses the review store verbatim: only the message is
  // de-identified fresh; every piece is badged "reviewed".
  const h = makeHarness();
  await driveSend(h, "First CanaryName question");
  acceptAllAndAck(h);
  const firstTransmit = h.ctrl.getRemoteReview().transmitText;
  await confirmSend(h);
  const callsAfterFirst = h.deidStub.calls.length;
  assert.ok(callsAfterFirst > 1, "first send de-identified everything");
  const review2 = await driveSend(h, "Second CanaryName question");
  assert.equal(h.deidStub.calls.length - callsAfterFirst, 1, "resend only de-identifies the message");
  assert.ok(review2.pieces.every((p) => p.badge === "reviewed"), "all pieces badged reviewed");
  assert.equal(review2.guidelines.badge, "reviewed", "guidelines badged reviewed");
  assert.equal(review2.transmitText, firstTransmit, "stored context transmitted verbatim");
}

{
  // (7) The draft note rides along when selected: it is de-identified in
  // the first review and badged "reviewed" (not "new") on the next send
  // when unchanged.
  const h = makeHarness({ draftText: "Draft: patient stable for discharge." });
  h.ctrl.change({
    matches: (sel) => sel === "[data-ai-chat-context-piece]",
    dataset: { aiChatContextPiece: "draft:current" },
    checked: true
  });
  const review = await driveSend(h, "Q CanaryName");
  const draftPiece = review.pieces.find((p) => p.id === "draft:current");
  assert.ok(draftPiece, "draft piece in the review when selected");
  assert.ok(draftPiece.rawText.includes("stable for discharge"), "draft text reviewed");
  acceptAllAndAck(h);
  await confirmSend(h);
  const review2 = await driveSend(h, "Q2 CanaryName");
  const draftPiece2 = review2.pieces.find((p) => p.id === "draft:current");
  assert.ok(draftPiece2, "draft piece still in the review");
  assert.equal(draftPiece2.badge, "reviewed", "unchanged draft badged reviewed");
}

{
  // A changed piece is de-identified again and badged "changed".
  const patient = controllerFixturePatient();
  const h = makeHarness({ patient });
  h.ctrl.change({
    matches: (sel) => sel === "[data-ai-chat-context-piece]",
    dataset: { aiChatContextPiece: "admission:pmh" },
    checked: true
  });
  await driveSend(h, "Q CanaryName");
  acceptAllAndAck(h);
  await confirmSend(h);
  patient.contextSections[0].deidentifiedText = "Patient CanaryName presents with chest pain. Updated exam finding.";
  const review = await driveSend(h, "Q2 CanaryName");
  assert.equal(review.pieces.find((p) => p.id === "admission:hpi").badge, "changed", "mutated piece badged changed");
  assert.equal(review.pieces.find((p) => p.id === "admission:pmh").badge, "reviewed", "untouched piece reused");
}

{
  // (8) The shared selection drives the API review: deselecting a piece
  // removes it from the review and from what is transmitted. The
  // de-identification review gate is the consent point for exactly the
  // selection.
  const h = makeHarness();
  const togglePmh = (checked) => h.ctrl.change({
    matches: (sel) => sel === "[data-ai-chat-context-piece]",
    dataset: { aiChatContextPiece: "admission:pmh" },
    checked
  });
  togglePmh(true);
  await driveSend(h, "Q CanaryName");
  assert.ok(h.ctrl.getRemoteReview().pieces.some((p) => p.id === "admission:pmh"), "pmh included while selected");
  acceptAllAndAck(h);
  await confirmSend(h);
  togglePmh(false);
  const review = await driveSend(h, "Q2 CanaryName");
  assert.ok(!review.pieces.some((p) => p.id === "admission:pmh"), "deselected piece not reviewed");
  assert.ok(!review.transmitText.includes("Hypertension"), "deselected text not transmitted");
}

{
  // (9) Manual redaction renders as [REDACTED], survives cancel/resend via
  // the review store, and lands in the payload.
  const h = makeHarness();
  setToolsToggle(h, false);
  const review = await driveSend(h, "Q CanaryName");
  assert.equal(review.phase, "ready");
  const hpi = review.pieces.find((p) => p.id === "admission:hpi");
  assert.ok(hpi.rawText.includes("ManualTarget"), "fixture has a manual target");
  const anchorNode = {};
  const preview = { contains: (n) => n === anchorNode };
  globalThis.window = { getSelection: () => ({ toString: () => "ManualTarget", anchorNode }) };
  try {
    const btn = actionTarget("ai-chat-hipaa-redact-selection", { piece: hpi.id });
    btn.closest = (sel) => {
      if (sel === "[data-action]") return btn;
      if (sel === "[data-hipaa-piece-preview]") return preview;
      return null;
    };
    h.ctrl.click(btn);
  } finally {
    delete globalThis.window;
  }
  const hpiAfter = h.ctrl.getRemoteReview().pieces.find((p) => p.id === "admission:hpi");
  assert.ok(hpiAfter.approvedText.includes("[REDACTED]"), "manual redaction applied");
  assert.ok(!hpiAfter.approvedText.includes("ManualTarget"), "manual span gone");
  assert.ok(hpiAfter.manualRecords.some((r) => r.label === "MANUAL" && r.status === "accepted"), "manual record stored");
  // Cancel restores the raw message to the composer; nothing was sent.
  h.ctrl.click(actionTarget("ai-chat-hipaa-cancel"));
  assert.equal(h.ctrl.getRemoteReview(), null, "review closed");
  assert.equal(h.composerInput.value, "Q CanaryName", "raw message restored to composer");
  assert.equal(h.chatStub.calls.length, 0, "nothing sent");
  // Resend: the manual redaction is reused from the store.
  const review2 = await driveSend(h, "Q CanaryName");
  const hpi2 = review2.pieces.find((p) => p.id === "admission:hpi");
  assert.equal(hpi2.badge, "reviewed", "piece reused from store");
  assert.ok(hpi2.approvedText.includes("[REDACTED]"), "[REDACTED] persists across resend");
  assert.ok(hpi2.manualRecords.some((r) => r.label === "MANUAL"), "manual record persisted");
  acceptAllAndAck(h);
  const finalContent = h.ctrl.getRemoteReview().transmit.finalUserContent;
  await confirmSend(h);
  const sentInput = h.chatStub.calls[0].input;
  const sentContent = sentInput[sentInput.length - 1].content;
  assert.equal(sentContent, finalContent, "sent content is the reviewed content");
  assert.ok(sentContent.includes("[REDACTED]"), "[REDACTED] in the payload");
  assert.ok(!sentContent.includes("ManualTarget"), "manual target not in the payload");
}

{
  // AI Chat v3 no longer uses the legacy chatService setting: the system
  // prompt is built from the clinical preferences instead.
  const h = makeHarness({
    prefs: {
      chatService: "ob-ld", // legacy setting — must be ignored
      medicalService: "medicine",
      serviceFocus: "heart failure"
    }
  });
  setToolsToggle(h, false);
  await driveSend(h, "Q CanaryName");
  acceptAllAndAck(h);
  const pre = h.ctrl.getRemoteReview();
  await confirmSend(h);
  const systemPrompt = h.chatStub.calls[0].input[0].content;
  assert.equal(systemPrompt, pre.systemPromptText, "sent system prompt is the reviewed one");
  assert.ok(!systemPrompt.includes("Labor & Delivery"), "legacy chatService ignored");
  assert.ok(systemPrompt.includes("internal medicine wards"), "clinical medicalService used");
  assert.ok(systemPrompt.includes("STUDENT'S CUSTOM INSTRUCTIONS:"), "reviewed guidelines appended");
}

// ---------------------------------------------------------------------------
// presentation.js + app.js: CSP compliance for chat forms
// Regression test: inline event handlers are blocked by the CSP's
// script-src-attr 'none', and form navigations are blocked by form-action
// 'none'. The chat composer must therefore carry no inline handlers and no
// submit-type buttons, and the app must route submits through a delegated
// listener instead.
// ---------------------------------------------------------------------------

{
  const inlineHandler = /\son[a-z]+\s*=/i;
  const localBase = {
    ...base,
    hardware: {
      recommendation: {
        models: [{ model: { key: "qwen3-1.7b", label: "Qwen3 1.7B", blurb: "Small, fast." }, available: true }],
        recommendedKey: "qwen3-1.7b"
      }
    }
  };
  const localHtml = presentation.render({ ...localBase, mode: "local", remote: { messages: [], sending: false, webSearch: true, review: null }, hasApiKey: false });
  const remoteHtml = presentation.render({ ...base, mode: "remote", remote: { messages: [], sending: false, webSearch: true, review: null }, hasApiKey: true });
  for (const [label, html] of [["local", localHtml], ["remote", remoteHtml]]) {
    assert.ok(!inlineHandler.test(html), `${label} mode chat markup has no inline event handlers (CSP script-src-attr)`);
    assert.ok(!html.includes('type="submit"'), `${label} mode send button is not a submit button (would trigger blocked form navigation)`);
    assert.ok(html.includes("data-ai-chat-form"), `${label} mode composer form present`);
  }
}

{
  const appSource = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.ok(appSource.includes('addEventListener("submit", handleSubmit)'), "app.js registers a delegated submit listener");
  assert.ok(appSource.includes("function handleSubmit(event)"), "app.js defines handleSubmit");
  for (const path of ["../src/ui/ai-chat/presentation.js", "../src/ui/scores/presentation.js"]) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(!src.includes("onsubmit="), `${path} has no inline onsubmit handlers`);
  }
}

console.log("ai-chat tests passed");

{
  const ids = ["gpt-5.6", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"];
  for (const id of ids) {
    const row = pricingForModel(id);
    assert.ok(row, `pricing row for ${id}`);
    assert.ok(row.contextWindow > 0, `${id} has a context window`);
    assert.ok(row.inputPerMillion > 0 && row.outputPerMillion > 0, `${id} has rates`);
  }
  assert.equal(pricingForModel("gpt-nope"), null, "unknown model has no pricing row");
  assert.equal(pricingForModel(""), null, "empty model has no pricing row");
  assert.equal(pricingForModel("gpt-5.6").contextWindow, 1050000, "GPT-5.6 window");
  assert.equal(pricingForModel("gpt-5.4").contextWindow, 1050000, "GPT-5.4 window (1.05M per official model page)");
  assert.equal(pricingForModel("gpt-5.4-mini").contextWindow, 400000, "GPT-5.4 mini window");
  assert.equal(pricingForModel("gpt-5.4").cachedInputPerMillion, 0.25, "GPT-5.4 cached rate");
  assert.equal(pricingForModel("gpt-5.4-mini").cachedInputPerMillion, 0.075, "mini cached rate");
  assert.equal(pricingForModel("gpt-5.4-nano").cachedInputPerMillion, 0.02, "nano cached rate");
  assert.ok(Object.keys(OPENAI_MODEL_PRICING).length >= 6, "covers every repo model option");
}

{
  // GPT-5.6 Sol short context: $4/1M in, $20/1M out.
  // (100K tokens stays under the 272K long-context threshold.)
  const c = costForUsage({ model: "gpt-5.6", inputTokens: 100_000, outputTokens: 100_000 });
  assert.equal(c.unknownPricing, false);
  assert.equal(c.longContext, false);
  assert.ok(Math.abs(c.totalCost - 2.4) < 1e-9, `short-context total is $2.40, got ${c.totalCost}`);
}

{
  // Cached input bills at the cached rate and is not double-counted.
  const c = costForUsage({ model: "gpt-5.6", inputTokens: 100_000, cachedInputTokens: 100_000 });
  assert.ok(Math.abs(c.totalCost - 0.04) < 1e-9, `100K cached input is $0.04, got ${c.totalCost}`);
  assert.ok(Math.abs(c.inputCost) < 1e-12, "no double-counted input cost");
}

{
  // Long context: above the threshold the long rates apply, including the
  // long-context cached-input rate.
  const c = costForUsage({
    model: "gpt-5.6",
    inputTokens: LONG_CONTEXT_THRESHOLD + 1000,
    cachedInputTokens: LONG_CONTEXT_THRESHOLD + 1000,
    outputTokens: 1_000_000
  });
  assert.equal(c.longContext, true, "long context detected");
  const expected = ((LONG_CONTEXT_THRESHOLD + 1000) / 1e6) * 0.8 + 30;
  assert.ok(Math.abs(c.totalCost - expected) < 1e-6, `long-context total, got ${c.totalCost}`);
}

{
  // Web search calls bill per call.
  const c = costForUsage({ model: "gpt-5.6", webSearchCalls: 3 });
  assert.ok(Math.abs(c.searchCost - 3 * WEB_SEARCH_COST_PER_CALL) < 1e-12, "search cost per call");
  assert.ok(Math.abs(c.totalCost - c.searchCost) < 1e-12, "search-only total");
}

{
  // Unknown model: never invent a cost.
  const c = costForUsage({ model: "gpt-future", inputTokens: 5000, outputTokens: 5000 });
  assert.equal(c.unknownPricing, true, "unknown pricing flagged");
  assert.equal(c.totalCost, 0, "unknown pricing totals zero");
}

{
  // Cached tokens can never exceed input tokens.
  const c = costForUsage({ model: "gpt-5.6", inputTokens: 100, cachedInputTokens: 99999 });
  assert.ok(Math.abs(c.totalCost - (100 / 1e6) * 0.4) < 1e-12, "cached clamped to input");
}

assert.equal(formatUsd(0.0042), "$0.0042", "sub-cent amounts show 4 decimals");
assert.equal(formatUsd(0.00999), "$0.0100", "rounds to 4 decimals under a cent");
assert.equal(formatUsd(1.5), "$1.50", "dollar amounts show 2 decimals");
assert.equal(formatUsd(0), "$0.00", "zero formats cleanly");
assert.equal(formatTokens(999), "999", "small counts plain");
assert.equal(formatTokens(12400), "12.4K", "thousands compact");
assert.equal(formatTokens(1050000), "1.05M", "millions compact");

// ---------------------------------------------------------------------------
// openai-client.js: requestOpenAiChatWithUsage
// ---------------------------------------------------------------------------

{
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      json: async () => ({
        output: [
          { type: "web_search_call", id: "ws1" },
          { type: "message", content: [{ type: "output_text", text: "Cited reply. [Stub]" }] }
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          input_tokens_details: { cached_tokens: 800 }
        }
      })
    };
  };
  const result = await requestOpenAiChatWithUsage({
    apiKey: "sk-test",
    model: "gpt-5.6",
    input: "hello",
    tools: [{ type: "web_search" }],
    fetchImpl: fakeFetch
  });
  assert.equal(result.text, "Cited reply. [Stub]", "returns reply text");
  assert.equal(result.usage.inputTokens, 1000, "input tokens from usage");
  assert.equal(result.usage.outputTokens, 200, "output tokens from usage");
  assert.equal(result.usage.cachedInputTokens, 800, "cached tokens from details");
  assert.equal(result.usage.webSearchCalls, 1, "web_search_call items counted");
  assert.equal(calls[0].body.tools.length, 1, "tools forwarded");
}

{
  // Missing usage block degrades to zeros, not a crash.
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }]
    })
  });
  const result = await requestOpenAiChatWithUsage({ apiKey: "sk-test", model: "gpt-5.6", input: "hi", fetchImpl: fakeFetch });
  assert.equal(result.text, "hi", "text returned");
  assert.deepEqual(
    [result.usage.inputTokens, result.usage.outputTokens, result.usage.cachedInputTokens, result.usage.webSearchCalls],
    [0, 0, 0, 0],
    "usage defaults to zeros"
  );
}

// ---------------------------------------------------------------------------
// remote-chat.js: buildCompressionInput
// ---------------------------------------------------------------------------

{
  const history = [
    { role: "user", text: "q1" },
    { role: "assistant", text: "a1" },
    { role: "user", text: "q2" },
    { role: "assistant", text: "a2" },
    { role: "user", text: "q3" },
    { role: "assistant", text: "a3" },
    { role: "system", text: "should be ignored" }
  ];
  const { input, compressibleCount, keptTail } = buildCompressionInput({ history, keepTail: 2 });
  assert.equal(compressibleCount, 4, "four older messages compressible");
  assert.equal(keptTail.length, 2, "newest two kept verbatim");
  assert.equal(keptTail[0].text, "q3", "tail keeps newest exchange");
  assert.equal(keptTail[1].text, "a3", "tail keeps newest exchange");
  assert.equal(input.length, 2, "system + user input");
  assert.ok(!input[1].content.includes("should be ignored"), "system-role entries excluded");
  assert.ok(input[1].content.includes("q1") && input[1].content.includes("a2"), "older exchanges in transcript");
  assert.ok(!input[1].content.includes("q3"), "tail not duplicated in transcript");
}

{
  // A prior summary is labeled and folded in, never dropped.
  const history = [
    { role: "assistant", text: "Earlier: discussed MI workup.", summary: true },
    { role: "user", text: "q1" },
    { role: "assistant", text: "a1" },
    { role: "user", text: "q2" },
    { role: "assistant", text: "a2" }
  ];
  const { input, compressibleCount } = buildCompressionInput({ history, keepTail: 2 });
  assert.equal(compressibleCount, 3, "prior summary counts as compressible");
  assert.ok(input[1].content.includes("Summary of the earlier conversation"), "prior summary labeled");
}

// ---------------------------------------------------------------------------
// controller.js: remote usage/cost accumulation, reset, compression
// ---------------------------------------------------------------------------

function makeUsageChatStub(usage) {
  const calls = [];
  return {
    calls,
    requestOpenAiChatWithUsage: async ({ input, model, tools }) => {
      calls.push({ input, model, tools });
      return { text: "Reply. [Stub]", usage: { ...usage } };
    }
  };
}

// Full remote send through the review gate (de-id stub redacts CanaryName).
async function sendRemoteReviewed(h, message) {
  const review = await driveSend(h, message);
  assert.equal(review.phase, "ready", "review ready");
  acceptAllAndAck(h);
  const sent = await confirmSend(h);
  assert.equal(sent, true, "send happened");
}

{
  // Usage + cost accumulate per conversation and render in the view model.
  const chatStub = makeUsageChatStub({ inputTokens: 10000, outputTokens: 2000, cachedInputTokens: 4000, webSearchCalls: 2 });
  const h = makeHarness({ chatStub, prefs: { openAiModel: "gpt-5.6" } });
  setToolsToggle(h, false);
  await sendRemoteReviewed(h, "CanaryName question");
  const remote = h.ctrl.getRemoteState();
  assert.equal(remote.usage.inputTokens, 10000, "input tokens accumulated");
  assert.equal(remote.usage.outputTokens, 2000, "output tokens accumulated");
  assert.equal(remote.usage.cachedInputTokens, 4000, "cached tokens accumulated");
  assert.equal(remote.usage.webSearchCalls, 2, "search calls accumulated");
  assert.equal(remote.usage.calls, 1, "one billed call");
  assert.ok(remote.usage.costUsd > 0, "cost accumulated");
  const html = h.html();
  assert.ok(html.includes("aic-cost"), "cost line rendered");
  assert.ok(html.includes("$"), "dollar amount shown");
}

{
  // A second send accumulates onto the first; new chat resets the totals.
  const chatStub = makeUsageChatStub({ inputTokens: 10000, outputTokens: 2000, cachedInputTokens: 0, webSearchCalls: 0 });
  const h = makeHarness({ chatStub, prefs: { openAiModel: "gpt-5.6" } });
  setToolsToggle(h, false);
  await sendRemoteReviewed(h, "CanaryName question one");
  await sendRemoteReviewed(h, "CanaryName question two");
  let remote = h.ctrl.getRemoteState();
  assert.equal(remote.usage.calls, 2, "two billed calls");
  assert.equal(remote.usage.inputTokens, 20000, "tokens accumulate across sends");
  h.ctrl.click(actionTarget("ai-chat-new-chat-remote"));
  remote = h.ctrl.getRemoteState();
  assert.equal(remote.usage.calls, 0, "usage reset on new chat");
  assert.equal(remote.usage.costUsd, 0, "cost reset on new chat");
  assert.equal(remote.usage.inputTokens, 0, "tokens reset on new chat");
  assert.equal(remote.messages.length, 0, "messages cleared");
  assert.ok(!h.html().includes("aic-cost"), "cost line gone after reset");
}

{
  // Legacy stubs exposing only requestOpenAiChat still work; cost stays untracked.
  const calls = [];
  const legacyStub = {
    calls,
    requestOpenAiChat: async ({ input }) => {
      calls.push({ input });
      return "Legacy reply. [Stub]";
    }
  };
  const h = makeHarness({ chatStub: legacyStub, prefs: { openAiModel: "gpt-5.6" } });
  setToolsToggle(h, false);
  await sendRemoteReviewed(h, "CanaryName question");
  const remote = h.ctrl.getRemoteState();
  assert.equal(remote.messages.length, 2, "reply recorded via legacy stub");
  assert.equal(remote.usage.calls, 0, "no usage without usage-returning stub");
  assert.ok(!h.html().includes("aic-cost"), "no cost line without usage");
}

{
  // Remote context stats meter against the selected model's real window.
  const chatStub = makeUsageChatStub({ inputTokens: 1000, outputTokens: 100, cachedInputTokens: 0, webSearchCalls: 0 });
  const h = makeHarness({ chatStub, prefs: { openAiModel: "gpt-5.4-mini" } });
  setToolsToggle(h, false);
  await sendRemoteReviewed(h, "CanaryName question");
  const stats = h.ctrl.getRemoteState().contextStats;
  assert.ok(stats, "context stats recorded");
  assert.equal(stats.contextWindow, 400000, "meters against the selected model's window");
  assert.ok(String(stats.windowLabel || "").includes("mini"), "window labeled with the model");
  assert.ok(h.html().includes("Context"), "context meter rendered");
}

async function driveRemoteCompression(h) {
  const remote = h.ctrl.getRemoteState();
  if (!remote.compressArmed) {
    h.ctrl.click(actionTarget("ai-chat-compress-remote"));
    assert.equal(h.ctrl.getRemoteState().compressArmed, true, "first click arms");
  }
  h.ctrl.click(actionTarget("ai-chat-compress-remote"));
  const start = Date.now();
  while (h.ctrl.getRemoteState().compressing && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(h.ctrl.getRemoteState().compressing, false, "compression finished");
}

{
  // Remote compression: two-step confirm, summary replaces older messages,
  // newest exchange kept verbatim, usage recorded on the summary.
  const usage = { inputTokens: 50000, outputTokens: 400, cachedInputTokens: 0, webSearchCalls: 0 };
  const chatStub = makeUsageChatStub(usage);
  const h = makeHarness({ chatStub, prefs: { openAiModel: "gpt-5.6" } });
  setToolsToggle(h, false);
  const remote = h.ctrl.getRemoteState();
  remote.messages = [
    { role: "user", text: "q1" },
    { role: "assistant", text: "a1" },
    { role: "user", text: "q2" },
    { role: "assistant", text: "a2" },
    { role: "user", text: "q3" },
    { role: "assistant", text: "a3" }
  ];
  h.ctrl.click(actionTarget("ai-chat-compress-remote"));
  assert.equal(chatStub.calls.length, 0, "arming makes no API call");
  await driveRemoteCompression(h);
  assert.equal(chatStub.calls.length, 1, "one billed compression call");
  const after = h.ctrl.getRemoteState();
  assert.equal(after.messages.length, 3, "summary + newest exchange");
  assert.equal(after.messages[0].summary, true, "first message is the summary");
  assert.equal(after.messages[0].compressedCount, 4, "summary records folded count");
  assert.equal(after.messages[1].text, "q3", "newest exchange kept verbatim");
  assert.equal(after.messages[2].text, "a3", "newest exchange kept verbatim");
  assert.equal(after.usage.calls, 1, "compression call counted in usage");
  assert.ok(after.usage.costUsd > 0, "compression call costed");
  assert.ok(h.html().includes("summary"), "summary badge rendered");
}

{
  // Recompressing folds the earlier summary in instead of dropping it.
  const chatStub = makeUsageChatStub({ inputTokens: 50000, outputTokens: 400, cachedInputTokens: 0, webSearchCalls: 0 });
  const h = makeHarness({ chatStub, prefs: { openAiModel: "gpt-5.6" } });
  setToolsToggle(h, false);
  const remote = h.ctrl.getRemoteState();
  remote.messages = [
    { role: "assistant", text: "Earlier summary.", summary: true, compressedCount: 8 },
    { role: "user", text: "q1" },
    { role: "assistant", text: "a1" },
    { role: "user", text: "q2" },
    { role: "assistant", text: "a2" },
    { role: "user", text: "q3" },
    { role: "assistant", text: "a3" }
  ];
  await driveRemoteCompression(h);
  const sentInput = chatStub.calls[0].input;
  const transcript = JSON.stringify(sentInput);
  assert.ok(transcript.includes("Summary of the earlier conversation"), "prior summary folded into recompression");
  assert.ok(transcript.includes("Earlier summary."), "prior summary text preserved");
  const after = h.ctrl.getRemoteState();
  assert.equal(after.messages.filter((m) => m.summary).length, 1, "exactly one summary remains");
}

// ---------------------------------------------------------------------------
// controller.js: sidebar context budget meters the ACTIVE mode
// ---------------------------------------------------------------------------

function budgetMeter(html) {
  const m = html.match(/~([\d,]+)\s*\/\s*([\d,]+)\s*tokens/);
  assert.ok(m, "sidebar renders a context budget meter");
  return { used: m[1], window: m[2] };
}

// Full remote send through the review gate (de-id stub redacts CanaryName).
async function sendReviewedOnce(h, message) {
  const review = await driveSend(h, message);
  assert.equal(review.phase, "ready", "review ready");
  acceptAllAndAck(h);
  assert.equal(await confirmSend(h), true, "send happened");
}

// Clicks send and waits for the direct-send path: no review modal appears
// and the OpenAI stub sees a new call.
async function driveSendExpectSkip(h, message) {
  const beforeChat = h.chatStub.calls.length;
  const beforeAgent = h.agentStub.calls.length;
  h.ctrl.click(sendRemoteAction(message));
  const start = Date.now();
  for (;;) {
    const review = h.ctrl.getRemoteReview();
    if (review && (review.phase === "ready" || review.phase === "failed")) {
      throw new Error(`expected a direct send, but the review modal opened (phase ${review.phase})`);
    }
    if (h.chatStub.calls.length > beforeChat || h.agentStub.calls.length > beforeAgent) {
      await tick(30);
      assert.equal(h.ctrl.getRemoteReview(), null, "no review modal after the direct send");
      return;
    }
    if (Date.now() - start > 8000) throw new Error("timed out waiting for the direct send");
    await tick();
  }
}

{
  // Remote mode meters the remote conversation against the selected
  // OpenAI model's real context window (GPT-6 Luna: 1.05M tokens).
  const h = makeHarness({ prefs: { openAiModel: "gpt-6-luna" } });
  await sendReviewedOnce(h, "first question");
  const meter = budgetMeter(h.html());
  assert.equal(meter.window, "1,050,000", "remote budget uses the GPT-6 Luna window");
  assert.ok(h.html().includes("GPT-6 Luna"), "remote budget names the active model");
  assert.ok(h.ctrl.getRemoteState().messages.length >= 2, "remote history accumulated");
}

{
  // Returning to on-device mode restores the local model window
  // (4,096 tokens) instead of keeping the remote one.
  const h = makeHarness({ prefs: { openAiModel: "gpt-6-luna" } });
  await sendReviewedOnce(h, "first question");
  assert.equal(budgetMeter(h.html()).window, "1,050,000", "remote window while in ChatGPT mode");
  h.ctrl.click(actionTarget("ai-chat-mode", { mode: "local" }));
  const meter = budgetMeter(h.html());
  assert.equal(meter.window, "4,096", "on-device budget restores the local window");
  assert.ok(!h.html().includes("1,050,000"), "remote window is gone in on-device mode");
}

{
  // A cheaper-window model meters against its own window.
  const h = makeHarness({ prefs: { openAiModel: "gpt-5.4-mini" } });
  await sendReviewedOnce(h, "first question");
  assert.equal(budgetMeter(h.html()).window, "400,000", "budget follows the selected model");
}

// ---------------------------------------------------------------------------
// controller.js: PHI review opens only when new context is added
// ---------------------------------------------------------------------------

{
  // A clean follow-up with unchanged, already-reviewed context skips the
  // review modal entirely — every message is still de-identified, but the
  // unchanged context is not re-reviewed.
  const h = makeHarness({});
  await sendReviewedOnce(h, "first question");
  const deidCallsBefore = h.deidStub.calls.length;
  const msgsBefore = h.ctrl.getRemoteState().messages.length;
  await driveSendExpectSkip(h, "second question, nothing new");
  assert.ok(h.ctrl.getRemoteState().messages.length > msgsBefore, "follow-up message sent directly");
  assert.equal(h.ctrl.getRemoteReview(), null, "no review modal for unchanged context");
  // The new message itself was still de-identified exactly once.
  assert.equal(h.deidStub.calls.length, deidCallsBefore + 1, "follow-up message de-identified once");
}

{
  // A message with fresh de-identification findings reopens the modal even
  // when the context is unchanged and fully reviewed.
  const h = makeHarness({});
  await sendReviewedOnce(h, "first question");
  const review = await driveSend(h, "tell me about CanaryName");
  assert.equal(review.phase, "ready", "message-level findings reopen the review modal");
  assert.ok((review.messageCounts || {}).NAME > 0, "the message carries fresh redaction counts");
  assert.ok(review.messageTransformed.includes("[NAME]"), "message findings are visible in the review");
}

{
  // Changed chart context reopens the modal even when the new message is
  // clean — simulating a chart update between sends.
  const h = makeHarness({});
  await sendReviewedOnce(h, "first question");
  h.app.vault.patients[0].contextSections[0].deidentifiedText =
    "Patient CanaryName presents with chest pain. Now also short of breath.";
  const review = await driveSend(h, "clean follow-up");
  assert.equal(review.phase, "ready", "changed context reopens the review modal");
  const hpi = review.pieces.find((p) => p.id === "admission:hpi");
  assert.equal(hpi.badge, "changed", "edited piece is marked changed");
}

{
  // Cancelling the review leaves its redaction records pending, so the
  // next send reopens the modal even with unchanged context and a clean
  // message.
  const h = makeHarness({});
  const first = await driveSend(h, "first question");
  assert.equal(first.phase, "ready", "first send opens the review modal");
  h.ctrl.click(actionTarget("ai-chat-hipaa-cancel"));
  assert.equal(h.ctrl.getRemoteReview(), null, "cancel closes the review");
  assert.equal(h.chatStub.calls.length, 0, "cancelled review never sent");
  const second = await driveSend(h, "second question");
  assert.equal(second.phase, "ready", "pending records reopen the review modal");
}

// ---------------------------------------------------------------------------
// controller.js: composer Enter behavior
// ---------------------------------------------------------------------------

function fakeKeyEvent({ key = "Enter", shiftKey = false, isComposing = false, inComposer = true } = {}) {
  const input = {
    value: "typed message",
    closest: (sel) => (sel === "[data-ai-chat-input]" && inComposer ? input : null)
  };
  let prevented = false;
  return {
    input,
    prevented: () => prevented,
    event: { key, shiftKey, isComposing, target: input, preventDefault: () => { prevented = true; } }
  };
}

{
  // Plain Enter sends: the controller handles the key, prevents the
  // browser default, and clears the composer.
  const h = makeHarness({});
  const { event, input, prevented } = fakeKeyEvent();
  assert.equal(h.ctrl.keydown(event), true, "Enter is handled");
  assert.ok(prevented(), "Enter default is prevented");
  assert.equal(input.value, "", "composer cleared after Enter");
}

{
  // Shift+Enter is left alone so the browser inserts a newline.
  const h = makeHarness({});
  const { event, input, prevented } = fakeKeyEvent({ shiftKey: true });
  assert.equal(h.ctrl.keydown(event), false, "Shift+Enter is not intercepted");
  assert.equal(input.value, "typed message", "composer keeps its text on Shift+Enter");
  assert.ok(!prevented(), "default not prevented on Shift+Enter");
}

{
  // Enter during IME composition is ignored so CJK input is not sent
  // mid-composition.
  const h = makeHarness({});
  const { event, input } = fakeKeyEvent({ isComposing: true });
  assert.equal(h.ctrl.keydown(event), false, "IME Enter is not intercepted");
  assert.equal(input.value, "typed message", "composer keeps its text during IME composition");
}

{
  // Enter outside the composer is ignored.
  const h = makeHarness({});
  let prevented = false;
  const outsider = { value: "x", closest: () => null };
  const handled = h.ctrl.keydown({
    key: "Enter", shiftKey: false, isComposing: false, target: outsider,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(handled, false, "Enter outside the composer is ignored");
  assert.ok(!prevented, "default not prevented outside the composer");
}

// ---------------------------------------------------------------------------
// chat-tools.js: ChatGPT-mode clinical tool set (25 calculators + 7 models)
// ---------------------------------------------------------------------------

{
  // The chat exposes exactly the four clinical-computation tools, in a
  // stable order, and the tool loop stays bounded like Agent mode.
  const tools = createChatTools();
  assert.deepEqual(Object.keys(tools), CHAT_TOOL_NAMES, "chat exposes exactly the four clinical tools");
  assert.deepEqual(CHAT_TOOL_NAMES, [
    "list_clinical_calculators",
    "run_clinical_calculator",
    "list_ai_models",
    "run_ai_model"
  ]);
  assert.equal(CHAT_MAX_STEPS, 8, "tool loop stays bounded at 8 steps");
  assert.match(CHAT_TOOLS_TAG, /^20260929-chat-tools-v1$/, "tool module is version-tagged");
}

{
  // list_ai_models: all seven native models, with the preprint flagged.
  const tools = createChatTools();
  const out = await tools.list_ai_models.execute({ filter: "" }, {});
  assert.equal(out.deterministic.kind, "ai-model-list");
  assert.equal(out.deterministic.count, 7, "seven native AI models exposed");
  assert.deepEqual(
    out.deterministic.models.map((m) => m.id).sort(),
    ["autoscore-mortality", "covidgram", "easp-sepsis", "isaric4c", "periop-xgboost", "qrisk3", "recode"].sort()
  );
  const periop = out.deterministic.models.find((m) => m.id === "periop-xgboost");
  assert.equal(periop.peerReviewed, false, "preprint model is flagged not peer-reviewed");
  assert.match(out.text, /PREPRINT/, "preprint warning is human-visible in the list text");
}

{
  // run_ai_model: unknown id never throws — structured not-found.
  const tools = createChatTools();
  const out = await tools.run_ai_model.execute({ modelId: "nope", inputs: {} }, {});
  assert.equal(out.deterministic.found, false);
  assert.match(out.text, /Unknown AI model/);
}

{
  // run_ai_model: missing inputs are reported, never invented.
  const tools = createChatTools();
  const out = await tools.run_ai_model.execute({ modelId: "qrisk3", inputs: {} }, {});
  assert.equal(out.deterministic.complete, false);
  assert.ok(out.deterministic.missing.length > 0, "missing inputs are listed");
  assert.match(out.text, /do not invent them/i, "model is told not to invent inputs");
}

{
  // run_ai_model: complete run returns the deterministic fact payload with
  // provenance (COVID-GRAM low-risk vector from test-ai-models.js).
  const tools = createChatTools();
  const out = await tools.run_ai_model.execute({
    modelId: "covidgram",
    inputs: {
      xrayAbnormality: 0, age: 30, hemoptysis: 0, dyspnea: 0, unconsciousness: 0,
      comorbidityCount: 0, cancerHistory: 0, nlr: 2.0, ldh: 200, directBilirubin: 8
    }
  }, {});
  assert.equal(out.deterministic.complete, true);
  assert.equal(out.deterministic.modelId, "covidgram");
  assert.ok(out.deterministic.headline.length > 0, "headline present");
  assert.ok(
    Math.abs(out.deterministic.result.probability - 0.012288129343777267) <= 1e-9,
    "probability matches the reference vector"
  );
  assert.match(out.text, /Reference:/, "provenance reference is surfaced");
}

{
  // run_ai_model: the preprint model's complete result carries its
  // validation warning alongside the number.
  const tools = createChatTools();
  const out = await tools.run_ai_model.execute({
    modelId: "periop-xgboost",
    inputs: { age: 65, sex: 1, heightCm: 175, weightKg: 80, asa: 2, emergency: 0 }
  }, {});
  assert.equal(out.deterministic.complete, true);
  assert.equal(out.deterministic.peerReviewed, false);
  assert.match(out.text, /WARNING/i, "preprint warning travels with the result");
  assert.ok(out.deterministic.validationNote.length > 0, "validation note retained in the payload");
}

{
  // run_clinical_calculator via the chat set: incomplete lists what is
  // missing; complete returns the verified score payload.
  const tools = createChatTools();
  const incomplete = await tools.run_clinical_calculator.execute({ calculatorId: "chadsvasc", inputs: {} }, {});
  assert.equal(incomplete.deterministic.complete, false);
  assert.ok(incomplete.deterministic.missing.length > 0, "missing calculator inputs are listed");
  assert.match(incomplete.text, /do not invent them/i);
  const complete = await tools.run_clinical_calculator.execute({
    calculatorId: "chadsvasc",
    inputs: { age: 1, sex: 1, chf: 0, hypertension: 1, strokeTiaTe: 0, vascularDisease: 0, diabetes: 0 }
  }, {});
  assert.equal(complete.deterministic.complete, true);
  assert.equal(complete.deterministic.score, 3, "CHA2DS2-VASc: 65-74 + female + hypertension = 3");
  assert.ok(complete.deterministic.headline.length > 0, "headline present");
}

{
  // run_clinical_calculator: unknown id never throws.
  const tools = createChatTools();
  const out = await tools.run_clinical_calculator.execute({ calculatorId: "nope", inputs: {} }, {});
  assert.equal(out.deterministic.found, false);
  assert.match(out.text, /Unknown calculator/);
}

{
  // buildChatToolsSystemPrompt: the reviewed base prompt passes through
  // unchanged, with the tool-use rules appended.
  const base = "BASE-PROMPT-SENTINEL-123";
  const prompt = buildChatToolsSystemPrompt(base);
  assert.ok(prompt.startsWith(base), "base prompt is preserved verbatim at the top");
  assert.match(prompt, /list_clinical_calculators/, "calculator tools are named");
  assert.match(prompt, /list_ai_models/, "AI model tools are named");
  assert.match(prompt, /NEVER invent or assume missing inputs/, "never-invent rule is explicit");
  assert.match(prompt, /never claim MDCalc parity/, "AI models are fenced off from MDCalc parity");
  assert.match(prompt, /de-identified/, "PHI-safety rule is present");
}

// ---------------------------------------------------------------------------
// agent-runner.js: toToolRecord — audit-record normalization (pure)
// ---------------------------------------------------------------------------

{
  // SDK-wrapped tool output ({ type: "json", value }) unwraps to text +
  // deterministic payload.
  const rec = toToolRecord(
    { toolName: "run_clinical_calculator", output: { type: "json", value: { text: "CHA2DS2-VASc: 3", deterministic: { kind: "calculator-run", score: 3 } } } },
    { toolName: "run_clinical_calculator", input: { calculatorId: "chadsvasc" } },
    2
  );
  assert.equal(rec.step, 2);
  assert.equal(rec.toolName, "run_clinical_calculator");
  assert.deepEqual(rec.input, { calculatorId: "chadsvasc" });
  assert.equal(rec.text, "CHA2DS2-VASc: 3");
  assert.deepEqual(rec.deterministic, { kind: "calculator-run", score: 3 });
}

{
  // Raw (unwrapped) object output and plain-string output both normalize.
  const raw = toToolRecord(
    { toolName: "t", output: { text: "hi", deterministic: { kind: "x" } } },
    { toolName: "t", input: null },
    1
  );
  assert.equal(raw.text, "hi");
  assert.deepEqual(raw.deterministic, { kind: "x" });
  const str = toToolRecord({ toolName: "t", output: "plain" }, { toolName: "t" }, 1);
  assert.equal(str.text, "plain");
  assert.equal(str.deterministic, null);
}

{
  // Provider tools (web search) and malformed entries never break the
  // harvest — they yield records with null payloads.
  const provider = toToolRecord({ toolName: "web_search", output: { type: "text", value: "sources..." } }, { toolName: "web_search" }, 3);
  assert.equal(provider.toolName, "web_search");
  assert.equal(provider.deterministic, null);
  const malformed = toToolRecord({ toolName: "t", output: { get value() { throw new Error("boom"); } } }, { toolName: "t" }, 1);
  assert.equal(malformed.text, null, "throwing output normalizes to nulls, not an exception");
  assert.equal(malformed.deterministic, null);
  const empty = toToolRecord(null, {}, 1);
  assert.equal(empty.toolName, "");
  assert.equal(empty.input, null);
}

// ---------------------------------------------------------------------------
// controller.js: ChatGPT-mode clinical-tools send path
// ---------------------------------------------------------------------------

{
  // Tools ON (default): confirm routes through the tool loop. The assistant
  // message carries auditable tool records, and only the reviewed /
  // de-identified payload reaches the runner.
  const agentStub = makeAgentStub();
  const h = makeHarness({ agentStub });
  const review = await driveSend(h, "Summarize CanaryName for me");
  assert.equal(review.phase, "ready", "review ready");
  assert.equal(review.toolsEnabled, true, "clinical tools on by default in the review");
  acceptAllAndAck(h);
  const pre = h.ctrl.getRemoteReview();
  assert.equal(pre.canSend, true, "ack + zero pending => canSend");
  const sent = await confirmSend(h);
  assert.equal(sent, true, "send happened");
  assert.equal(agentStub.calls.length, 1, "tool loop ran once");
  assert.equal(h.chatStub.calls.length, 0, "single-shot path not used when tools are on");
  const args = agentStub.calls[0];
  assert.ok(String(args.systemPrompt).startsWith(pre.systemPromptText), "reviewed system prompt leads the loop system prompt");
  const lastMsg = args.messages[args.messages.length - 1];
  assert.ok(lastMsg.content.includes(pre.transmitText), "reviewed transmit text is the loop input");
  assert.ok(!lastMsg.content.includes("CanaryName"), "no raw canary reaches the loop");
  assert.ok(args.tools && typeof args.tools.run_clinical_calculator?.execute === "function", "clinical tools are passed to the loop");
  assert.equal(typeof args.fetchImpl, "function", "loop traffic goes through the network gate");
  const htmlAfter = h.html();
  assert.ok(htmlAfter.includes("· tools"), "assistant label shows tool use");
  assert.ok(htmlAfter.includes("run_clinical_calculator"), "tool record names the tool");
  assert.ok(htmlAfter.includes("CHA2DS2-VASc: incomplete"), "deterministic tool result text is rendered");
  assert.ok(htmlAfter.includes("calculator-run"), "deterministic payload kind is rendered");
  assert.ok(htmlAfter.includes("[NAME]"), "transformed message in history");
  assert.ok(!htmlAfter.includes("CanaryName"), "raw canary not in rendered history");
}

{
  // Toggling clinical tools off restores the single-shot send path, and
  // the review snapshot reflects the toggle.
  const agentStub = makeAgentStub();
  const h = makeHarness({ agentStub });
  setToolsToggle(h, false);
  const review = await driveSend(h, "Q CanaryName");
  assert.equal(review.phase, "ready", "review ready");
  assert.equal(review.toolsEnabled, false, "review snapshot reflects the toggle");
  acceptAllAndAck(h);
  const sent = await confirmSend(h);
  assert.equal(sent, true, "send happened");
  assert.equal(agentStub.calls.length, 0, "tool loop not used when tools are off");
  assert.equal(h.chatStub.calls.length, 1, "single-shot path used when tools are off");
}

{
  // Tool loop throw fails closed: an error assistant message, no crash,
  // and the transformed user message is already in history.
  const agentStub = makeAgentStub({ throwOnRun: true });
  const h = makeHarness({ agentStub });
  const review = await driveSend(h, "Q CanaryName");
  assert.equal(review.phase, "ready", "review ready");
  acceptAllAndAck(h);
  const sent = await confirmSend(h);
  assert.equal(sent, true, "confirm resolves even when the loop throws");
  assert.equal(agentStub.calls.length, 1, "loop was attempted");
  const htmlAfter = h.html();
  assert.ok(htmlAfter.includes("Error: network down"), "loop failure surfaces as an assistant error message");
  assert.ok(!htmlAfter.includes("CanaryName"), "raw canary not in rendered history");
}
