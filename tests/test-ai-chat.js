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
    redactedContext: "Pt is a 34F G2P1… [REDACTED DATE]…",
    redactionTotal: 3,
    redactionCounts: { DATE: 2, NAME: 1 },
    residualWarnings: ["possible MRN pattern: 12-34-56"],
    flags: []
  };
  const html = presentation.render({
    ...base,
    mode: "remote",
    remote: { messages: [], sending: false, webSearch: true, review },
    chatService: "",
    hasApiKey: true
  });
  assert.ok(html.includes("aic-hipaa"), "HIPAA review modal rendered");
  assert.ok(html.includes("Review before sending to ChatGPT"), "modal title");
  assert.ok(html.includes("Summarize this patient&#x27;s course.") || html.includes("Summarize this patient"), "message shown");
  assert.ok(html.includes("Pt is a 34F"), "redacted context shown");
  assert.ok(html.includes("DATE"), "redaction counts shown");
  assert.ok(html.includes("possible MRN pattern"), "residual warnings shown");
  assert.ok(html.includes("Nothing has been sent yet"), "explicit no-send-yet statement");
  assert.ok(html.includes("ai-chat-hipaa-confirm"), "confirm action present");
  assert.ok(html.includes("ai-chat-hipaa-cancel"), "cancel action present");
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
  const localHtml = presentation.render({ ...base, mode: "local", remote: { messages: [], sending: false, webSearch: true, review: null }, chatService: "", hasApiKey: false });
  const remoteHtml = presentation.render({ ...base, mode: "remote", remote: { messages: [], sending: false, webSearch: true, review: null }, chatService: "", hasApiKey: false });
  for (const [label, html] of [["local", localHtml], ["remote", remoteHtml]]) {
    assert.ok(!inlineHandler.test(html), `${label} mode chat markup has no inline event handlers (CSP script-src-attr)`);
    assert.ok(!html.includes('type="submit"'), `${label} mode send button is not a submit button (would trigger blocked form navigation)`);
    assert.ok(html.includes("data-ai-chat-form"), `${label} mode composer form present`);
  }
}

{
  const { readFileSync } = await import("node:fs");
  const appSource = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.ok(appSource.includes('addEventListener("submit", handleSubmit)'), "app.js registers a delegated submit listener");
  assert.ok(appSource.includes("function handleSubmit(event)"), "app.js defines handleSubmit");
  for (const path of ["../src/ui/ai-chat/presentation.js", "../src/ui/local-ai/presentation.js", "../src/ui/scores/presentation.js"]) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(!src.includes("onsubmit="), `${path} has no inline onsubmit handlers`);
  }
}

console.log("ai-chat tests passed");
