// Tests for AI Chat's remote (ChatGPT) mode:
//   src/ai/remote-chat.js   - service tailoring, rigorous citation system
//                             prompt, Responses-API message assembly
//   src/ui/openai-client.js - requestOpenAiChat (plain-text chat call)
//   src/app/preferences.js  - chatService preference
//   src/ui/ai-chat/presentation.js - mode segment, remote chat, HIPAA
//                                    review modal
//
// All fixtures are synthetic and PHI-free.

import assert from "node:assert/strict";

import {
  CHAT_SERVICE_OPTIONS,
  buildRemoteChatInput,
  buildRemoteChatSystemPrompt,
  chatServiceOption
} from "../src/ai/remote-chat.js";
import { requestOpenAiChat } from "../src/ui/openai-client.js";
import { DEFAULT_USER_PREFERENCES, chatServiceOption as prefChatServiceOption, normalizeUserPreferences } from "../src/app/preferences.js";
import { createAiChatPresentation } from "../src/ui/ai-chat/presentation.js";

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
// preferences.js: chatService
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
// presentation.js: mode segment, remote chat, HIPAA review
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
  contextInspector: null,
  chatServiceOptions: CHAT_SERVICE_OPTIONS
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
  const local = presentation.render({ ...localBase, mode: "local", remote: { messages: [], sending: false, webSearch: true, review: null }, chatService: "", hasApiKey: false });
  assert.ok(local.includes("On-device"), "mode segment offers on-device");
  assert.ok(local.includes("ChatGPT"), "mode segment offers ChatGPT");
  assert.ok(local.includes('data-mode="local"'), "mode switch action present");
  assert.ok(local.includes("aic-model"), "local mode renders the model row");
  assert.ok(!local.includes("data-ai-chat-service"), "local mode has no service picker");
  assert.ok(!local.includes("aic-hipaa"), "no HIPAA modal without a review");
}

{
  const remote = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [{ role: "user", text: "What is HELLP?" }, { role: "assistant", text: "HELLP is… [ACOG PB 222]" }], sending: false, webSearch: true, review: null },
    chatService: "ob-ld",
    hasApiKey: true
  });
  assert.ok(remote.includes('aria-selected="true"'), "ChatGPT tab selected in remote mode");
  assert.ok(remote.includes("data-ai-chat-service"), "service picker present");
  assert.ok(remote.includes("OB/GYN — Labor &amp; Delivery"), "service options rendered");
  assert.ok(remote.includes("data-ai-chat-websearch-toggle"), "web search toggle present");
  assert.ok(remote.includes("What is HELLP?"), "remote messages rendered");
  assert.ok(remote.includes("HELLP is…"), "remote replies rendered");
  assert.ok(remote.includes("data-action=\"ai-chat-revert-remote\""), "remote revert control present");
  assert.ok(remote.includes("data-ai-chat-form"), "remote composer present");
  assert.ok(!remote.includes("aic-model"), "remote mode hides the on-device model row");
}

{
  const noKey = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: null },
    chatService: "",
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
    chatService: "",
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
    expanded: ["header"]
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: acked },
    chatService: "",
    hasApiKey: true
  });
  assert.ok(html.includes('data-action="ai-chat-hipaa-confirm">'), "send enabled after ack");
  assert.ok(html.includes('data-ai-chat-hipaa-ack checked'), "ack checkbox reflects state");
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
    failedDetail: "Context de-identification failed (boom) \u2014 nothing was sent.",
    ack: false,
    expanded: []
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review: failed },
    chatService: "",
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
    chatService: "",
    hasApiKey: true
  });
  assert.ok(html.includes('aria-expanded="true"'), "expanded pieces marked open");
  const openCount = html.split('aria-expanded="true"').length - 1;
  assert.equal(openCount, 2, "exactly the two flagged pieces open");
}

console.log("ai-chat tests passed");
