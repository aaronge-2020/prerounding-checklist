// Tests for the browser-local LLM stack (src/local-llm/):
//   models.js        - registry + hardware-gated recommendations
//   section-split.js - prompt assembly, JSON extraction, chunking, verifier
//   parse.js         - orchestration with a stubbed model client (fail-closed)
//
// The verifier tests use synthetic, PHI-free fixture sentences.

import assert from "node:assert/strict";

import {
  WEBLLM_VERSION,
  formatBytes,
  localLlmModelByKey,
  LOCAL_LLM_MODELS,
  readHardwareFacts,
  recommendLocalLlmModels,
  detectWebGpu
} from "../src/local-llm/models.js";
import {
  buildSectionSplitPrompt,
  chunkNoteForSplit,
  mergeSectionSplitResults,
  parseSectionSplitJson,
  sectionSplitLabels,
  splitSentences,
  verifySectionSplit,
  SECTION_SPLIT_VERSION
} from "../src/local-llm/section-split.js";
import { splitNoteSectionsWithLlm } from "../src/local-llm/parse.js";
import {
  VERIFIER_ALLOWED_TYPES,
  VERIFIER_CONFIDENCE,
  VERIFIER_MAX_NOTE_CHARS,
  VERIFIER_SOURCE,
  buildVerifierPrompt,
  dedupeVerifierEntities,
  extractVerifierJsonArray,
  mapVerifierSpansToOffsets,
  runLlmVerifier
} from "../src/local-llm/verifier.js";
import { splitThinking, stripThinking } from "../src/local-llm/thinking.js";
import { MAX_PATIENT_CONTEXT_CHARS, buildPatientContextText } from "../src/local-llm/patient-context.js";
import { MAX_PRIMARY_NOTE_CHARS, buildPrimaryTeamNoteText } from "../src/local-llm/patient-context.js";
import {
  MAX_SELECTED_PIECES_CHARS,
  buildPatientContextFromPieces,
  defaultSelectedPieceIds,
  listPatientContextPieces
} from "../src/local-llm/patient-context.js";
import { CHARS_PER_TOKEN, TOKEN_SAFETY_MARGIN, buildChatMessages, estimateTokens } from "../src/local-llm/context-budget.js";
import { createAiChatPresentation } from "../src/ui/ai-chat/presentation.js";
import { buildSystemPrompt } from "../src/local-llm/system-prompt.js";
import { DEFAULT_SYSTEM_GUIDELINES } from "../src/local-llm/system-prompt.js";
import { renderChatMarkdown } from "../src/local-llm/markdown.js";
import { createSettingsPresentation } from "../src/ui/settings/presentation.js";

// ---------------------------------------------------------------------------
// models.js
// ---------------------------------------------------------------------------

assert.equal(WEBLLM_VERSION, "0.2.85", "webllm runtime version is pinned");
assert.equal(LOCAL_LLM_MODELS.length, 2, "two models registered");
assert.deepEqual(LOCAL_LLM_MODELS.map((m) => m.key), ["qwen3-1.7b", "qwen3-4b"]);

const small = localLlmModelByKey("qwen3-1.7b");
assert.equal(small.webllmId, "Qwen3-1.7B-q4f16_1-MLC");
assert.equal(small.contextWindow, 4096);
assert.ok(small.vramMB > 0 && small.approxDownloadMB > 0);
const large = localLlmModelByKey("qwen3-4b");
assert.equal(large.webllmId, "Qwen3-4B-q4f16_1-MLC");
assert.equal(large.contextWindow, 4096);
assert.ok(large.approxDownloadMB > small.approxDownloadMB, "4B download is larger than 1.7B");
assert.equal(localLlmModelByKey("nope"), null);

// readHardwareFacts with injected navigators (works in node, no globals).
assert.deepEqual(
  readHardwareFacts({ deviceMemory: 16, hardwareConcurrency: 8, platform: "MacIntel", userAgent: "ua" }),
  { deviceMemoryGB: 16, hardwareConcurrency: 8, platform: "MacIntel", userAgent: "ua" }
);
assert.deepEqual(
  readHardwareFacts({ hardwareConcurrency: 4 }),
  { deviceMemoryGB: null, hardwareConcurrency: 4, platform: "", userAgent: "" }
);
// Safari-style: no deviceMemory at all.
assert.equal(readHardwareFacts({}).deviceMemoryGB, null);

// Recommendation rules.
const noGpu = recommendLocalLlmModels(readHardwareFacts({ deviceMemory: 16 }), false);
assert.deepEqual(noGpu.availableKeys, [], "no WebGPU -> nothing offered");
assert.equal(noGpu.recommendedKey, null);
assert.ok(noGpu.models.every((m) => !m.available && /WebGPU/.test(m.note)));

const m2 = recommendLocalLlmModels(readHardwareFacts({ deviceMemory: 16, hardwareConcurrency: 8 }), true);
assert.deepEqual(m2.availableKeys, ["qwen3-1.7b", "qwen3-4b"], "16GB device can run both");
assert.equal(m2.recommendedKey, "qwen3-4b", "16GB device is recommended the 4B model");

const smallDevice = recommendLocalLlmModels(readHardwareFacts({ deviceMemory: 4 }), true);
assert.deepEqual(smallDevice.availableKeys, ["qwen3-1.7b"], "4GB device only gets the 1.7B model");
assert.equal(smallDevice.recommendedKey, "qwen3-1.7b");
assert.match(smallDevice.models[1].note, /8GB/, "4B card explains the memory requirement");

const unknownMem = recommendLocalLlmModels(readHardwareFacts({}), true);
assert.deepEqual(unknownMem.availableKeys, ["qwen3-1.7b", "qwen3-4b"], "unknown memory does not hide models");
assert.equal(unknownMem.recommendedKey, "qwen3-1.7b", "unknown memory conservatively recommends 1.7B");
assert.ok(unknownMem.models.every((m) => /does not report device memory/.test(m.note)), "honest about missing data");

assert.doesNotThrow(() => recommendLocalLlmModels(null, true), "null facts degrade gracefully");
assert.doesNotThrow(() => recommendLocalLlmModels(undefined, false));

// detectWebGpu with injected fakes.
assert.equal(await detectWebGpu({}), false, "no gpu field -> false");
assert.equal(await detectWebGpu({ gpu: {} }), false, "no requestAdapter -> false");
assert.equal(await detectWebGpu({ gpu: { requestAdapter: async () => null } }), false, "null adapter -> false");
assert.equal(await detectWebGpu({ gpu: { requestAdapter: async () => ({}) } }), true, "adapter -> true");
assert.equal(
  await detectWebGpu({ gpu: { requestAdapter: async () => { throw new Error("denied"); } } }),
  false,
  "request failure -> false"
);

assert.equal(formatBytes(0), "0.0 B");
assert.equal(formatBytes(1536), "1.5 KB");
assert.equal(formatBytes(5 * 1024 * 1024 * 1024), "5.0 GB");

// ---------------------------------------------------------------------------
// section-split.js
// ---------------------------------------------------------------------------

const hpLabels = sectionSplitLabels("hp");
assert.ok(hpLabels.includes("history_of_present_illness"));
assert.ok(hpLabels.includes("physical_exam"));
assert.ok(hpLabels.includes("other"));
assert.ok(!hpLabels.includes("interval_events"), "H&P has no interval_events");
const progLabels = sectionSplitLabels("progress");
assert.ok(progLabels.includes("interval_events"));
assert.ok(!progLabels.includes("past_medical_history"), "progress notes have no PMH section");

const sampleNote = "HPI: 68 y/o man with chest pain.\nHe denies fever.\n\nEXAM: Lungs clear.\n";
const prompt = buildSectionSplitPrompt(sampleNote, "progress");
assert.equal(prompt.version, SECTION_SPLIT_VERSION);
assert.match(prompt.system, /verbatim/i, "system prompt demands verbatim output");
assert.match(prompt.system, /never rewrite|do not rewrite|without rewriting/i, "system prompt forbids rewriting");
assert.match(prompt.user, /68 y\/o man with chest pain/, "user prompt carries the note text");
for (const label of ["interval_events", "physical_exam", "other"]) {
  assert.ok(prompt.user.includes(label), `user prompt lists allowed label ${label}`);
}
assert.ok(prompt.labels.length > 5);

// JSON extraction: tolerates prose wrappers and code fences.
const wrapped = 'Here is the split:\n```json\n{"sections": {"other": "abc"}, "unparsed": ""}\n```\nDone.';
assert.deepEqual(parseSectionSplitJson(wrapped), { sections: { other: "abc" }, unparsed: "" });
assert.throws(() => parseSectionSplitJson("no json here at all"), /no JSON object/);
assert.throws(() => parseSectionSplitJson('prefix {"sections": } suffix'), /not valid JSON/);

// Chunking.
assert.deepEqual(chunkNoteForSplit("short note"), ["short note"], "short note is one chunk");
const longNote = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}: sentence about the patient's hospital course and findings on examination today.`).join("\n\n");
const chunks = chunkNoteForSplit(longNote);
assert.ok(chunks.length > 1, "long note is split into chunks");
assert.equal(chunks.join("\n\n"), longNote, "chunks reassemble to the full note");
for (const chunk of chunks) {
  assert.ok(chunk.trim().length > 0, "no empty chunks");
}

// Sentence splitting.
assert.deepEqual(splitSentences("One. Two.\nThree"), ["One.", "Two.", "Three"]);

// Verifier: perfect verbatim split passes with full coverage.
const src1 = "He has chest pain.\nLungs are clear.\nAspirin started.";
const good1 = {
  sections: {
    history_of_present_illness: "He has chest pain.",
    physical_exam: "Lungs are clear.",
    plan: "Aspirin started."
  },
  unparsed: ""
};
const v1 = verifySectionSplit(good1, src1, "hp");
assert.equal(v1.ok, true, `perfect split verifies: ${v1.errors.join("; ")}`);
assert.equal(v1.coverage, 1);

// Verifier: fabricated sentence fails.
const fabricated = {
  sections: { history_of_present_illness: "He has chest pain. He also has diabetes." },
  unparsed: ""
};
const vFab = verifySectionSplit(fabricated, src1, "hp");
assert.equal(vFab.ok, false, "fabrication is rejected");
assert.ok(vFab.errors.some((e) => /verbatim/i.test(e)));

// Verifier: unknown label fails.
const vLabel = verifySectionSplit({ sections: { made_up_section: "He has chest pain." }, unparsed: "" }, src1, "hp");
assert.equal(vLabel.ok, false, "unknown label is rejected");
assert.ok(vLabel.errors.some((e) => /Unknown section label/i.test(e)));

// Verifier: duplicated sentence (emitted twice, present once) fails.
const dup = {
  sections: {
    history_of_present_illness: "He has chest pain.",
    review_of_systems: "He has chest pain."
  },
  unparsed: ""
};
const vDup = verifySectionSplit(dup, src1, "hp");
assert.equal(vDup.ok, false, "duplication is rejected");
assert.ok(vDup.errors.some((e) => /Duplicated/i.test(e)));

// Verifier: a sentence that genuinely appears twice may be emitted twice.
const src2 = "Denies fever.\nDenies fever.\nLungs clear.";
const legitDup = {
  sections: { review_of_systems: "Denies fever.\nDenies fever.", physical_exam: "Lungs clear." },
  unparsed: ""
};
const vLegit = verifySectionSplit(legitDup, src2, "hp");
assert.equal(vLegit.ok, true, `legitimate repeats verify: ${vLegit.errors.join("; ")}`);

// Verifier: unparsed leftovers are allowed (reviewed as "other"); they count
// toward coverage because the verifier can see they were not dropped.
const partial = {
  sections: { history_of_present_illness: "He has chest pain." },
  unparsed: "Lungs are clear.\nAspirin started."
};
const vPartial = verifySectionSplit(partial, src1, "hp");
assert.equal(vPartial.ok, true, "partial split with unparsed text verifies");
assert.equal(vPartial.coverage, 1, "unparsed text is accounted, not dropped");

// Verifier: silently dropped sentences lower coverage.
const dropped = { sections: { history_of_present_illness: "He has chest pain." }, unparsed: "" };
const vDropped = verifySectionSplit(dropped, src1, "hp");
assert.equal(vDropped.ok, true, "dropped sentences still verify structurally");
assert.ok(Math.abs(vDropped.coverage - 1 / 3) < 1e-9, "coverage reflects dropped sentences");

// Verifier: missing sections object fails.
assert.equal(verifySectionSplit({}, src1, "hp").ok, false);
assert.equal(verifySectionSplit(null, src1, "hp").ok, false);

// Merge: sections concatenate across chunks, unparsed accumulates.
const merged = mergeSectionSplitResults(
  { sections: { plan: "Aspirin." }, unparsed: "x" },
  { sections: { plan: "Statin.", other: "Note." }, unparsed: "y" }
);
assert.equal(merged.sections.plan, "Aspirin.\nStatin.");
assert.equal(merged.sections.other, "Note.");
assert.equal(merged.unparsed, "x\ny");

// ---------------------------------------------------------------------------
// parse.js (orchestration with a stubbed model client)
// ---------------------------------------------------------------------------

function stubClient(responses) {
  let calls = 0;
  return {
    calls: () => calls,
    chat: async () => {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls++;
      if (response instanceof Error) throw response;
      return response;
    }
  };
}

const orchNote = "He has chest pain.\nLungs are clear.";
const orchJson = JSON.stringify({
  sections: {
    history_of_present_illness: "He has chest pain.",
    physical_exam: "Lungs are clear."
  },
  unparsed: ""
});
const orchResult = await splitNoteSectionsWithLlm(stubClient([orchJson]), orchNote, "hp");
assert.equal(orchResult.sections.history_of_present_illness, "He has chest pain.");
assert.equal(orchResult.sections.physical_exam, "Lungs are clear.");

// A <think> preamble (even one containing braces) is stripped before JSON
// extraction, so it cannot corrupt the parse.
const thinkyJson = `<think>\nDeciding sections. The note mentions {chest pain} and lungs.\n</think>\n\n${orchJson}`;
const thinkyResult = await splitNoteSectionsWithLlm(stubClient([thinkyJson]), orchNote, "hp");
assert.equal(thinkyResult.sections.history_of_present_illness, "He has chest pain.");
assert.equal(thinkyResult.sections.physical_exam, "Lungs are clear.");
assert.equal(orchResult.coverage, 1);
assert.equal(orchResult.chunks, 1);

// Fail closed: fabricated model output rejects the whole parse after retries.
const badJson = JSON.stringify({
  sections: { history_of_present_illness: "He has chest pain and also a third arm." },
  unparsed: ""
});
await assert.rejects(
  splitNoteSectionsWithLlm(stubClient([badJson]), orchNote, "hp"),
  /failed verification|Non-verbatim|verify/i,
  "fabricated output throws instead of being used"
);

// Fail closed: model errors propagate (caller keeps the deterministic parse).
await assert.rejects(
  splitNoteSectionsWithLlm(stubClient([new Error("gpu exploded")]), orchNote, "hp"),
  /gpu exploded/
);

// Multi-chunk merge through the orchestrator.
const bigNote = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}: finding sentence recorded on examination today with additional clinical detail.`).join("\n\n");
const bigChunks = chunkNoteForSplit(bigNote);
assert.ok(bigChunks.length > 1, "fixture spans multiple chunks");
const bigClient = {
  chat: async (messages) => {
    const userText = messages.find((m) => m.role === "user")?.content || "";
    // Echo every source sentence into "other" — trivially verifiable.
    const lines = userText.split("Note text:\n\n")[1] || "";
    return JSON.stringify({ sections: { other: lines.trim() }, unparsed: "" });
  }
};
const bigResult = await splitNoteSectionsWithLlm(bigClient, bigNote, "progress", {
  onChunk: ({ index, total }) => assert.ok(index <= total)
});
assert.equal(bigResult.chunks, bigChunks.length);
assert.ok(bigResult.coverage > 0.9, `multi-chunk coverage is high (${bigResult.coverage})`);

// ---------------------------------------------------------------------------
// thinking.js — <think> blocks never reach the rendered chat
// ---------------------------------------------------------------------------

{
  const plain = splitThinking("Hello! How can I assist you today?");
  assert.equal(plain.thinking, "", "no think block means empty reasoning");
  assert.equal(plain.text, "Hello! How can I assist you today?");
}

{
  const split = splitThinking("<think>\nOkay, the user said \"Hello\". I need to respond politely.\n</think>\n\nHello! How can I assist you today?");
  assert.equal(split.thinking, 'Okay, the user said "Hello". I need to respond politely.');
  assert.equal(split.text, "Hello! How can I assist you today?");
  assert.ok(!split.text.includes("<think>") && !split.text.includes("</think>"), "no raw tags in visible text");
  assert.ok(!split.thinking.includes("<think>"), "no raw tags in reasoning either");
}

{
  // Streaming: an unclosed trailing <think> is treated as in-progress reasoning.
  const streaming = splitThinking("<think>\nStill thinking about the differential");
  assert.equal(streaming.thinking, "Still thinking about the differential");
  assert.equal(streaming.text, "");
}

{
  // Multiple blocks merge; stray closers are stripped.
  const multi = splitThinking("A <think>t1</think> B <think>t2</think> C</think>");
  assert.equal(multi.thinking, "t1\n\nt2");
  assert.equal(multi.text, "A  B  C");
  assert.ok(!multi.text.includes("think>"), "stray closer stripped");
}

{
  assert.equal(stripThinking("<think>reasoning</think>Final answer."), "Final answer.");
  assert.equal(stripThinking(""), "");
  const nullish = splitThinking(null);
  assert.deepEqual(nullish, { thinking: "", text: "" });
}

console.log("local LLM tests passed");

// --- patient-context.js: admission context + hospital course builder ------

function fixturePatient() {
  return {
    id: "patient-1",
    displayLabel: "Bed 12",
    metadata: { admissionDate: "2026-09-25" },
    contextSections: [
      { label: "Admission reason and initial severity", deidentifiedText: "Admitted with acute hypoxemic respiratory failure." },
      { label: "Relevant baseline and active problem context", deidentifiedText: "COPD on 2L home oxygen." },
      { label: "Empty section", deidentifiedText: "   " }
    ],
    days: [
      {
        label: "Hospital day 1",
        date: "2026-09-25",
        sourceCaptures: [
          { label: "Interval events", deidentifiedText: "Tolerated BiPAP overnight." },
          { label: "Empty capture", deidentifiedText: "" }
        ],
        quickNotes: ["Check ABG in AM"]
      },
      {
        label: "Hospital day 2",
        date: "2026-09-26",
        sourceCaptures: [{ label: "Key results and trends", deidentifiedText: "ABG improved on BiPAP." }],
        quickNotes: []
      }
    ]
  };
}

{
  assert.equal(buildPatientContextText(null), "", "no patient -> empty context");
  assert.equal(buildPatientContextText(undefined), "", "undefined patient -> empty context");
}

{
  const text = buildPatientContextText(fixturePatient());
  assert.ok(text.includes("PATIENT: Bed 12"), "patient label in header");
  assert.ok(text.includes("Admitted: 2026-09-25"), "admission date in header");
  assert.ok(text.includes("ADMISSION CONTEXT:"), "admission block present");
  assert.ok(text.includes("## Admission reason and initial severity"), "section labels kept");
  assert.ok(text.includes("acute hypoxemic respiratory failure"), "section text kept");
  assert.ok(!text.includes("Empty section"), "empty sections skipped");
  assert.ok(text.includes("HOSPITAL COURSE:"), "course block present");
  assert.ok(text.indexOf("Hospital day 1") < text.indexOf("Hospital day 2"), "days chronological");
  assert.ok(text.includes("Tolerated BiPAP overnight."), "daily captures kept");
  assert.ok(text.includes("- Check ABG in AM"), "quick notes kept");
  assert.ok(!text.includes("Empty capture"), "empty captures skipped");
}

{
  // Budget pressure drops the oldest days first, keeping admission + recent.
  const big = fixturePatient();
  big.days = Array.from({ length: 10 }, (_, i) => ({
    label: `Hospital day ${i + 1}`,
    date: `2026-09-${String(20 + i).padStart(2, "0")}`,
    sourceCaptures: [{ label: "Note", deidentifiedText: `Day ${i + 1} content `.repeat(60) }],
    quickNotes: []
  }));
  const text = buildPatientContextText(big, { maxChars: 1200 });
  assert.ok(text.length <= 1200, `context fits budget (got ${text.length})`);
  assert.ok(text.includes("ADMISSION CONTEXT:"), "admission survives truncation");
  assert.ok(text.includes("acute hypoxemic respiratory failure"), "admission text survives truncation");
  assert.ok(text.includes("Hospital day 10"), "most recent day kept");
  assert.ok(!text.includes("Hospital day 1 ("), "oldest day dropped first");
}

{
  assert.ok(MAX_PATIENT_CONTEXT_CHARS >= 1000, "default budget is sane");
  const text = buildPatientContextText(fixturePatient());
  assert.ok(text.length <= MAX_PATIENT_CONTEXT_CHARS, "default budget respected");
}

{
  // A patient with no chart text still yields an identifiable header.
  const text = buildPatientContextText({ id: "p2", displayLabel: "Bed 7", metadata: {}, contextSections: [], days: [] });
  assert.ok(text.includes("PATIENT: Bed 7"), "header identifies the patient");
}

console.log("patient context tests passed");

// --- presentation: streaming "Thinking" indicator -------------------------
// Regression: the assistant bubble used to render only once streamingText
// was non-empty, so after sending the user saw nothing until the first
// token (10-60s on a local model). The bubble must exist from the moment
// streaming starts so onToken has a target and the user sees feedback.

{
  const presentation = createAiChatPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => ""
  });
  const base = {
    hardware: { recommendation: { models: [], recommendedKey: null } },
    settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: true },
    llmStatus: { status: "ready", verified: true, activeModelKey: "qwen3-1.7b" },
    downloaded: {},
    patientContext: { enabled: false, available: false, label: "", hasPatient: false }
  };
  const waiting = presentation.render({
    ...base,
    chat: { messages: [{ role: "user", text: "hi" }], streamingText: "", modelKey: "", modelLabel: "", streaming: true }
  });
  assert.ok(waiting.includes('data-ai-chat-streaming'), "streaming bubble exists before first token");
  assert.ok(waiting.includes("aic-thinking"), "thinking indicator shown while waiting for first token");
  assert.ok(waiting.includes("data-ai-chat-thinking-label"), "thinking label carries the live-timer hook");
  assert.ok(waiting.includes(">Reading context…<"), "prefill label names what the model is doing");

  const withText = presentation.render({
    ...base,
    chat: { messages: [{ role: "user", text: "hi" }], streamingText: "Hello", modelKey: "", modelLabel: "", streaming: true }
  });
  assert.ok(withText.includes('data-ai-chat-streaming'), "streaming bubble persists once tokens arrive");
  assert.ok(!withText.includes("aic-thinking"), "thinking indicator replaced by streamed text");
  assert.ok(withText.includes("Hello"), "streamed text rendered");

  const idle = presentation.render({
    ...base,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false }
  });
  assert.ok(!idle.includes('data-ai-chat-streaming'), "no streaming bubble when idle");
  assert.ok(!idle.includes("aic-thinking"), "no thinking indicator when idle");

  // Accuracy disclaimer: UI-rendered, always visible under the composer,
  // naming the active model.
  assert.ok(idle.includes('data-ai-chat-disclaimer'), "disclaimer rendered in chat view");
  assert.ok(idle.includes("aic-disclaimer"), "disclaimer uses left-aligned styling");
  assert.ok(idle.includes("thousands of times smaller"), "disclaimer states the scale gap");
  assert.ok(idle.includes("may be inaccurate"), "disclaimer warns about accuracy");
  const withModel = presentation.render({
    ...base,
    hardware: { recommendation: { models: [{ model: { key: "qwen3-4b", label: "Qwen3 4B", blurb: "" }, available: true, note: "" }], recommendedKey: "qwen3-4b" } },
    llmStatus: { status: "ready", verified: true, activeModelKey: "qwen3-4b" },
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false }
  });
  assert.ok(withModel.includes("Qwen3 4B"), "disclaimer names the active model");

  // Assistant messages render markdown; raw markers and HTML never survive.
  const mdReply = presentation.render({
    ...base,
    chat: { messages: [{ role: "assistant", text: "**Source:** Admission notes\n\n- one\n- two" }], streamingText: "", modelKey: "", modelLabel: "", streaming: false }
  });
  assert.ok(mdReply.includes("<strong>Source:</strong>"), "assistant bold rendered");
  assert.ok(mdReply.includes("<ul>") && mdReply.includes("<li>one</li>"), "assistant list rendered");
  assert.ok(!mdReply.includes("**Source:**"), "no raw markdown markers in output");
  const evilReply = presentation.render({
    ...base,
    chat: { messages: [{ role: "assistant", text: "<script>alert(1)</script>" }], streamingText: "", modelKey: "", modelLabel: "", streaming: false }
  });
  assert.ok(!evilReply.includes("<script>alert"), "model HTML escaped in chat");
}

console.log("local AI presentation tests passed");

// --- system-prompt.js: identity / environment guidelines -------------------
// The model must know it runs on-device in this browser (not on any cloud),
// what Preround is, and that Aaron Ge created the app.

{
  const prompt = buildSystemPrompt();
  assert.ok(prompt.includes("Aaron Ge"), "names the app creator");
  assert.ok(prompt.includes("Preround"), "names the app");
  assert.ok(/on-device/i.test(prompt), "states on-device execution");
  assert.ok(/not on any cloud/i.test(prompt), "denies cloud execution");
  assert.ok(/never claim to run on a cloud/i.test(prompt), "forbids cloud-provider identity claims");
  assert.ok(/answer medical and clinical questions directly instead of refusing/i.test(prompt), "instructs answering medical questions, not refusing");
  assert.ok(!prompt.includes("PATIENT:"), "no patient block without context");
}

{
  const prompt = buildSystemPrompt({ contextText: "PATIENT: Bed 12\nAdmitted: 2026-09-25" });
  assert.ok(prompt.includes("Aaron Ge"), "identity kept when context attached");
  assert.ok(prompt.includes("PATIENT: Bed 12"), "patient context appended");
  assert.ok(/using ONLY the patient context/i.test(prompt), "context-grounding instruction present");
}

{
  // Editable guidelines: a custom value replaces the default; empty or
  // whitespace-only falls back to DEFAULT_SYSTEM_GUIDELINES.
  const custom = buildSystemPrompt({ guidelines: "You are a pirate assistant. Be concise." });
  assert.ok(custom.startsWith("You are a pirate assistant."), "custom guidelines used");
  assert.ok(!custom.includes("Aaron Ge"), "default not mixed into custom guidelines");
  assert.strictEqual(buildSystemPrompt({ guidelines: "" }), DEFAULT_SYSTEM_GUIDELINES, "empty guidelines fall back to default");
  assert.strictEqual(buildSystemPrompt({ guidelines: "   " }), DEFAULT_SYSTEM_GUIDELINES, "whitespace guidelines fall back to default");
  assert.strictEqual(buildSystemPrompt(), DEFAULT_SYSTEM_GUIDELINES, "omitted guidelines fall back to default");
  const customCtx = buildSystemPrompt({ guidelines: "Custom.", contextText: "PATIENT: Bed 1" });
  assert.ok(customCtx.startsWith("Custom."), "custom guidelines kept with context");
  assert.ok(customCtx.includes("PATIENT: Bed 1"), "context still appended with custom guidelines");
}

console.log("system prompt tests passed");

// --- settings: Local AI guidelines editor -----------------------------------
// The guidelines must be editable in Settings and round-trip through the
// persisted value (empty storage -> built-in default shown).

{
  const settingsPresentation = createSettingsPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  });
  const html = settingsPresentation.renderSettings({
    preferences: {},
    apiKeySaved: false,
    guidelineSets: [],
    OPENAI_WORKUP_MODEL_OPTIONS: [],
    localAiGuidelines: DEFAULT_SYSTEM_GUIDELINES
  });
  assert.ok(html.includes('id="localAiGuidelinesInput"'), "guidelines textarea rendered");
  assert.ok(html.includes("Aaron Ge"), "default guidelines shown in the editor");
  assert.ok(html.includes('data-action="save-local-ai-guidelines"'), "save action present");
  assert.ok(html.includes('data-action="reset-local-ai-guidelines"'), "reset action present");
  const customHtml = settingsPresentation.renderSettings({
    preferences: {},
    apiKeySaved: false,
    guidelineSets: [],
    OPENAI_WORKUP_MODEL_OPTIONS: [],
    localAiGuidelines: "Custom guidelines here."
  });
  assert.ok(customHtml.includes("Custom guidelines here."), "persisted custom guidelines shown in the editor");
}

console.log("settings guidelines tests passed");

// --- markdown.js: safe rendering of assistant messages ----------------------
// Model output is untrusted: HTML must be escaped, then a small markdown
// subset (bold, italic, code, lists) rendered.

{
  const bold = renderChatMarkdown("**Source:** Admission notes");
  assert.ok(bold.includes("<strong>Source:</strong>"), "bold rendered");
  assert.ok(!bold.includes("**"), "no raw bold markers left");

  const list = renderChatMarkdown("- one\n- two");
  assert.ok(list.includes("<ul>") && list.includes("<li>one</li>"), "bullet list rendered");

  const olist = renderChatMarkdown("1. first\n2. second");
  assert.ok(olist.includes("<ol") && olist.includes("<li>second</li>"), "numbered list rendered");

  const em = renderChatMarkdown("Some *italic* text");
  assert.ok(em.includes("<em>italic</em>"), "italic rendered");

  const code = renderChatMarkdown("Use `lactulose` here");
  assert.ok(code.includes("<code>lactulose</code>"), "inline code rendered");

  const evil = renderChatMarkdown('<script>alert(1)</script><img src=x onerror=y>');
  assert.ok(!evil.includes("<script>") && !evil.includes("<img"), "raw HTML never rendered");
  assert.ok(evil.includes("&lt;script&gt;"), "HTML escaped");

  const paras = renderChatMarkdown("First para.\n\nSecond para.");
  assert.strictEqual((paras.match(/<p>/g) || []).length, 2, "blank line splits paragraphs");
}

console.log("markdown tests passed");

// --- markdown.js: continuous list numbering --------------------------------
// Small on-device models emit "1. Diagnosis …\n\n1. Treatment …" — one logical
// list with blank lines between items. Blank lines must not split the list
// (that rendered "1. 1. 1. 1."), and numbering must continue across an
// interrupting bullet list instead of restarting at 1.

{
  const restarted = renderChatMarkdown("1. **Diagnosis:** fever\n\n1. **Treatment:** abx");
  assert.strictEqual((restarted.match(/<ol/g) || []).length, 1, "blank-separated items stay in one list");
  assert.ok(restarted.includes('<ol start="1">'), "list opens at 1");
  assert.strictEqual((restarted.match(/<li>/g) || []).length, 2, "both items kept");

  const interrupted = renderChatMarkdown("1. one\n\n- sub point\n\n1. two");
  const opens = [...interrupted.matchAll(/<ol start="(\d+)">/g)].map((m) => m[1]);
  assert.deepStrictEqual(opens, ["1", "2"], "numbering continues after an interrupting list");

  const plain = renderChatMarkdown("1. first\n2. second");
  assert.ok(plain.includes('<ol start="1">'), "plain list still opens at 1");
  assert.ok(!plain.includes('start="2"'), "no spurious second list");

  // Paragraphs still break lists; only blank lines are tolerated.
  const broken = renderChatMarkdown("- a\n\nA paragraph.\n\n- b");
  assert.strictEqual((broken.match(/<ul>/g) || []).length, 2, "paragraph still splits bullet lists");
}

console.log("markdown continuous-numbering tests passed");

// --- context-budget.js: dynamic context-window monitoring ------------------
// The prompt is measured BEFORE sending against the model's real window:
// budget = contextWindow - maxTokens - TOKEN_SAFETY_MARGIN. Oldest history
// is dropped first; the latest message is always kept; the system prompt
// is truncated only as a last resort.

{
  assert.strictEqual(estimateTokens(""), 0, "empty text estimates 0 tokens");
  assert.strictEqual(estimateTokens(null), 0, "null estimates 0 tokens");
  assert.strictEqual(estimateTokens("x".repeat(360)), 100, "~3.6 chars/token");
  assert.strictEqual(TOKEN_SAFETY_MARGIN, 256, "safety margin is 256 tokens");
  assert.ok(CHARS_PER_TOKEN > 0, "chars-per-token documented");
}

{
  // A small conversation fits entirely: nothing dropped, nothing truncated.
  const assembled = buildChatMessages({
    systemContent: "You are helpful.",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" }
    ],
    contextWindow: 4096,
    maxTokens: 1024
  });
  assert.strictEqual(assembled.messages.length, 4, "system + 3 history messages");
  assert.strictEqual(assembled.messages[0].role, "system", "system message first");
  assert.strictEqual(assembled.droppedMessages, 0, "nothing dropped");
  assert.strictEqual(assembled.systemTruncated, false, "system not truncated");
  assert.strictEqual(assembled.contextWindow, 4096, "window reported");
  assert.strictEqual(assembled.budget, 4096 - 1024 - TOKEN_SAFETY_MARGIN, "budget = window - maxTokens - margin");
  assert.ok(assembled.promptTokens > 0, "prompt tokens measured");
  assert.ok(assembled.messages.every((m) => typeof m.content === "string"), "all messages have content");
}

{
  // Over budget: oldest messages drop first, the latest is always kept.
  // window 1024 -> budget = 1024 - 1024 - 256, floored at 512.
  const big = (n, tag) => `${tag}:` + "x".repeat(n);
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: big(350, `msg${i}`) }));
  const assembled = buildChatMessages({
    systemContent: big(36, "sys"), // ~10 tokens
    messages: history,
    contextWindow: 1024,
    maxTokens: 1024
  });
  assert.strictEqual(assembled.budget, 512, "budget floored at 512");
  assert.ok(assembled.droppedMessages > 0, "oldest messages dropped");
  const keptContents = assembled.messages.slice(1).map((m) => m.content);
  assert.ok(keptContents.includes(history[history.length - 1].content), "latest message always kept");
  assert.ok(!keptContents.includes(history[0].content), "oldest message dropped first");
  assert.ok(assembled.promptTokens <= assembled.budget + 360 / CHARS_PER_TOKEN, "prompt near budget (latest kept even if tight)");
}

{
  // A huge system prompt alone over budget gets truncated, flagged, and
  // still leaves room for the latest message.
  const assembled = buildChatMessages({
    systemContent: "y".repeat(10000),
    messages: [{ role: "user", content: "hi" }],
    contextWindow: 1024,
    maxTokens: 64
  });
  assert.strictEqual(assembled.systemTruncated, true, "system truncation flagged");
  assert.ok(assembled.messages[0].content.includes("truncated to fit"), "truncation marker present");
  assert.ok(assembled.messages[0].content.length < 10000, "system actually shortened");
  assert.strictEqual(assembled.messages.length, 2, "system + latest message survive");
}

console.log("context budget tests passed");

// --- buildPrimaryTeamNoteText: chat attaches just the primary note --------
// Selection: newest hospital day first whose sourceCaptures holds a
// primary_note capture with text; falls back to the admission
// contextSections primary_note; "" when none exists anywhere.

function primaryNoteFixture() {
  return {
    id: "p1",
    displayLabel: "Bed 12",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { label: "H&P", sourceKind: "primary_note", deidentifiedText: "Admission H&P text" },
      { label: "Labs", sourceKind: "laboratory_results", deidentifiedText: "lab text" }
    ],
    days: [
      {
        label: "Hospital day 1",
        date: "2026-09-21",
        sourceCaptures: [
          { label: "Primary team note", sourceKind: "primary_note", deidentifiedText: "Day 1 primary note" }
        ],
        quickNotes: []
      },
      {
        label: "Hospital day 2",
        date: "2026-09-22",
        sourceCaptures: [
          { label: "Primary team note", sourceKind: "primary_note", deidentifiedText: "Day 2 primary note" },
          { label: "Labs", sourceKind: "laboratory_results", deidentifiedText: "day 2 labs" }
        ],
        quickNotes: []
      }
    ]
  };
}

{
  // Newest day's primary note wins.
  const text = buildPrimaryTeamNoteText(primaryNoteFixture());
  assert.ok(text.includes("PATIENT: Bed 12"), "header identifies the patient");
  assert.ok(text.includes("Admitted: 2026-09-20"), "admission date shown");
  assert.ok(text.includes("Day 2 primary note"), "newest day's primary note selected");
  assert.ok(!text.includes("Day 1 primary note"), "older day's note not included");
  assert.ok(!text.includes("Admission H&P text"), "admission H&P not included when a day note exists");
  assert.ok(text.includes("PRIMARY TEAM NOTE (Hospital day 2 (2026-09-22))"), "note source labeled");
  assert.ok(!text.includes("day 2 labs"), "non-primary captures excluded");
}

{
  // No day notes -> falls back to the admission primary_note section.
  const patient = primaryNoteFixture();
  patient.days = [{ label: "Hospital day 1", date: "2026-09-21", sourceCaptures: [], quickNotes: [] }];
  const text = buildPrimaryTeamNoteText(patient);
  assert.ok(text.includes("Admission H&P text"), "admission primary note used as fallback");
  assert.ok(text.includes("PRIMARY TEAM NOTE (Admission)"), "admission source labeled");
}

{
  // Nothing anywhere -> empty.
  const text = buildPrimaryTeamNoteText({
    id: "p3", displayLabel: "Bed 3", metadata: {}, contextSections: [], days: []
  });
  assert.strictEqual(text, "", "no primary note yields empty string");
  assert.strictEqual(buildPrimaryTeamNoteText(null), "", "null patient yields empty string");
  // A primary_note capture with empty text does not count.
  const empty = primaryNoteFixture();
  empty.days = [{ label: "Hospital day 1", date: "2026-09-21", sourceCaptures: [{ label: "Primary team note", sourceKind: "primary_note", deidentifiedText: "  " }], quickNotes: [] }];
  empty.contextSections = [];
  assert.strictEqual(buildPrimaryTeamNoteText(empty), "", "blank primary note yields empty string");
}

{
  // Budget cap respected.
  assert.ok(MAX_PRIMARY_NOTE_CHARS >= 1000, "default primary-note budget is sane");
  const patient = primaryNoteFixture();
  patient.days[1].sourceCaptures[0].deidentifiedText = "z".repeat(5000);
  const text = buildPrimaryTeamNoteText(patient, { maxChars: 800 });
  assert.ok(text.length <= 800, `primary note fits budget (got ${text.length})`);
}

console.log("primary team note tests passed");

// --- presentation: context-window meter ------------------------------------
// After a send, the chat view shows a quiet "Context NN%" meter from
// chat.contextStats, plus a note when older messages were trimmed.

{
  const presentation = createAiChatPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => ""
  });
  const base = {
    hardware: { recommendation: { models: [], recommendedKey: null } },
    settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: true },
    llmStatus: { status: "ready", verified: true, activeModelKey: "qwen3-4b" },
    downloaded: {},
    patientContext: { enabled: false, available: false, label: "", hasPatient: false }
  };
  const metered = presentation.render({
    ...base,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false, contextStats: { promptTokens: 2048, contextWindow: 4096, droppedMessages: 0 } }
  });
  assert.ok(metered.includes("aic-context"), "meter rendered when stats present");
  assert.ok(metered.includes("Context 50%"), "meter shows measured share of window");

  const trimmed = presentation.render({
    ...base,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false, contextStats: { promptTokens: 3000, contextWindow: 4096, droppedMessages: 2 } }
  });
  assert.ok(trimmed.includes("older messages trimmed"), "trimmed note shown when messages dropped");

  const unmeasured = presentation.render({
    ...base,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false }
  });
  assert.ok(!unmeasured.includes("aic-context"), "no meter before the first send");
}

console.log("context meter tests passed");

// --- context pieces: selectable chart documents for the Context inspector --
// listPatientContextPieces enumerates admission sections, day captures, and
// quick notes (skipping empty text); defaultSelectedPieceIds prefers primary
// notes, falling back to admission sections; buildPatientContextFromPieces
// assembles only the selected pieces within a char budget.

function piecesFixture() {
  return {
    id: "p1",
    displayLabel: "Bed 12",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { id: "s-hp", label: "H&P", sourceKind: "primary_note", deidentifiedText: "Admission H&P text" },
      { id: "s-labs", label: "Labs", sourceKind: "laboratory_results", deidentifiedText: "lab text" },
      { id: "s-empty", label: "Empty", sourceKind: "other_chart_text", deidentifiedText: "   " }
    ],
    days: [
      {
        id: "d1", label: "Hospital day 1", date: "2026-09-21",
        sourceCaptures: [
          { id: "c1", label: "Primary team note", sourceKind: "primary_note", deidentifiedText: "Day 1 primary note" },
          { id: "c2", label: "Labs", sourceKind: "laboratory_results", deidentifiedText: "day 1 labs" }
        ],
        quickNotes: ["called about pain"]
      },
      {
        id: "d2", label: "Hospital day 2", date: "2026-09-22",
        sourceCaptures: [
          { id: "c3", label: "Primary team note", sourceKind: "primary_note", deidentifiedText: "Day 2 primary note" }
        ],
        quickNotes: []
      }
    ]
  };
}

{
  const pieces = listPatientContextPieces(piecesFixture());
  assert.strictEqual(pieces.length, 6, `2 admission + 3 captures + 1 quick-notes (got ${pieces.length})`);
  assert.deepStrictEqual(
    pieces.map((p) => p.group),
    ["Admission", "Admission", "Hospital day 1 (2026-09-21)", "Hospital day 1 (2026-09-21)", "Hospital day 1 (2026-09-21)", "Hospital day 2 (2026-09-22)"],
    "groups in document order"
  );
  assert.ok(pieces.every((p) => typeof p.id === "string" && p.id.length > 0), "stable ids");
  assert.strictEqual(new Set(pieces.map((p) => p.id)).size, pieces.length, "ids unique");
  assert.ok(pieces.every((p) => p.chars > 0), "empty-text sections skipped");
  const primaries = pieces.filter((p) => p.primary);
  assert.strictEqual(primaries.length, 3, "primary_note pieces flagged");
  assert.strictEqual(listPatientContextPieces(null).length, 0, "null patient yields no pieces");
}

{
  // Primary notes preferred when they exist.
  const selected = defaultSelectedPieceIds(piecesFixture());
  const pieces = listPatientContextPieces(piecesFixture());
  const primaryIds = pieces.filter((p) => p.primary).map((p) => p.id);
  assert.deepStrictEqual(selected, primaryIds, "defaults to the primary notes");

  // No primary note anywhere -> admission sections.
  const noPrimary = piecesFixture();
  noPrimary.contextSections = noPrimary.contextSections.filter((s) => s.sourceKind !== "primary_note");
  noPrimary.days.forEach((d) => {
    d.sourceCaptures = d.sourceCaptures.filter((c) => c.sourceKind !== "primary_note");
  });
  const fallback = defaultSelectedPieceIds(noPrimary);
  assert.deepStrictEqual(
    fallback,
    listPatientContextPieces(noPrimary).filter((p) => p.group === "Admission").map((p) => p.id),
    "falls back to admission sections"
  );

  // Nothing at all -> empty selection.
  assert.deepStrictEqual(
    defaultSelectedPieceIds({ id: "p", contextSections: [], days: [] }),
    [],
    "empty patient yields empty selection"
  );
}

{
  // Only selected pieces are assembled, in document order.
  const patient = piecesFixture();
  const pieces = listPatientContextPieces(patient);
  const labsOnly = pieces.filter((p) => p.label === "Labs").map((p) => p.id);
  const text = buildPatientContextFromPieces(patient, labsOnly);
  assert.ok(text.includes("PATIENT: Bed 12"), "header identifies the patient");
  assert.ok(text.includes("lab text"), "selected admission labs included");
  assert.ok(text.includes("day 1 labs"), "selected day labs included");
  assert.ok(!text.includes("Day 1 primary note"), "unselected primary note excluded");
  assert.ok(!text.includes("called about pain"), "unselected quick notes excluded");

  // Quick notes assemble as a bullet list.
  const qn = pieces.filter((p) => p.label === "Quick notes").map((p) => p.id);
  const qnText = buildPatientContextFromPieces(patient, qn);
  assert.ok(qnText.includes("- called about pain"), "quick notes listed");

  // Empty / unknown selection yields "".
  assert.strictEqual(buildPatientContextFromPieces(patient, []), "", "empty selection yields empty string");
  assert.strictEqual(buildPatientContextFromPieces(patient, ["nope:missing"]), "", "unknown ids ignored");
  assert.strictEqual(buildPatientContextFromPieces(null, ["x"]), "", "null patient yields empty string");

  // Budget cap respected.
  assert.ok(MAX_SELECTED_PIECES_CHARS >= 1000, "default pieces budget is sane");
  const big = piecesFixture();
  big.contextSections[0].deidentifiedText = "z".repeat(9000);
  const capped = buildPatientContextFromPieces(patient, defaultSelectedPieceIds(big), { maxChars: 800 });
  assert.ok(capped.length <= 800, `selected pieces fit budget (got ${capped.length})`);
}

console.log("context pieces tests passed");

// --- draft note as an opt-in context piece ----------------------------------
// listPatientContextPieces appends the student's current draft note (plain
// text from the Review controller) as one selectable piece when provided.
// It is never selected by default — the user attaches it explicitly.

{
  const patient = piecesFixture();
  const without = listPatientContextPieces(patient);
  assert.ok(without.every((p) => p.id !== "draft:current"), "no draft piece without draft text");

  const withDraft = listPatientContextPieces(patient, { draftNoteText: "  " });
  assert.ok(withDraft.every((p) => p.id !== "draft:current"), "blank draft text yields no piece");

  const pieces = listPatientContextPieces(patient, { draftNoteText: "My in-progress note" });
  const draftPiece = pieces.find((p) => p.id === "draft:current");
  assert.ok(draftPiece, "draft piece appended");
  assert.strictEqual(draftPiece.group, "Draft note", "draft group label");
  assert.strictEqual(draftPiece.label, "Current draft note", "draft piece label");
  assert.strictEqual(draftPiece.kind, "draft_note", "draft piece kind");
  assert.ok(draftPiece.chars > 0, "draft chars counted");
  assert.strictEqual(draftPiece.primary, false, "draft never flagged primary");

  // Never selected by default.
  assert.ok(!defaultSelectedPieceIds(patient).includes("draft:current"), "draft not in defaults");

  // Selected explicitly, it assembles into the context.
  const text = buildPatientContextFromPieces(patient, ["draft:current"], { draftNoteText: "My in-progress note" });
  assert.ok(text.includes("My in-progress note"), "draft text attached when selected");
  assert.ok(text.includes("Current draft note"), "draft section labeled in context");

  // Without the draft text passed through, a stale id assembles nothing.
  const stale = buildPatientContextFromPieces(patient, ["draft:current"]);
  assert.ok(!stale.includes("My in-progress note"), "stale draft id yields no text");
}

console.log("draft note piece tests passed");

// --- import graph: one cache-bust query per local-llm module ----------------
// ES modules are keyed by their full URL, query string included. Two
// importers using different ?v= values for the same module silently get two
// module instances — which split the sharedLocalLlmClient() singleton and
// made every "parse with local AI" fail with "Load a local model before
// chatting" even though the Local AI view showed a verified model. Every
// runtime importer of a local-llm module must use the same query string.

{
  const { readdir, readFile } = await import("node:fs/promises");
  const { dirname, extname, join, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const runtimeFiles = [];
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await collect(full);
      else if (extname(entry.name) === ".js") runtimeFiles.push(full);
    }
  }
  await collect(join(repoRoot, "src"));
  runtimeFiles.push(join(repoRoot, "index.html"));

  const specifierRe = /local-llm\/([A-Za-z][\w-]*\.js)(\?v=([^"'`\s)]+))?/;
  const queriesByModule = new Map();
  for (const file of runtimeFiles) {
    const text = await readFile(file, "utf8");
    // Real module specifiers only: quoted strings in import/from,
    // dynamic import(), or new URL() positions.
    const importRe = /(?:import\s+(?:[^"']*?\s+from\s+)?|import\s*\(|new\s+URL\s*\()\s*["']([^"']+)["']/g;
    let im;
    while ((im = importRe.exec(text))) {
      const sm = specifierRe.exec(im[1]);
      if (!sm) continue;
      const mod = `local-llm/${sm[1]}`;
      const query = sm[3] || "(no query string)";
      if (!queriesByModule.has(mod)) queriesByModule.set(mod, new Map());
      const seen = queriesByModule.get(mod);
      if (!seen.has(query)) seen.set(query, []);
      seen.get(query).push(relative(repoRoot, file));
    }
  }
  assert.ok(queriesByModule.size > 0, "found local-llm imports in the runtime graph");
  for (const [mod, seen] of queriesByModule) {
    assert.equal(
      seen.size,
      1,
      `${mod} is imported with ${seen.size} different cache-bust queries ` +
        `(${[...seen.keys()].join(", ")}) — mismatched queries split the module singleton`
    );
  }
}

console.log("local-llm import alignment tests passed");

// --- parse: liveness and deterministic generation ---------------------------
// The orchestrator must forward an onToken callback (the UI renders live
// token counts so a slow model reads as "working", not "hung") and must
// disable chain-of-thought for extraction (thinking would burn the output
// token budget and slow every chunk).
{
  const seenCalls = [];
  const tokenEvents = [];
  const probeClient = {
    chat: async (messages, opts) => {
      seenCalls.push({ messages, opts });
      for (const t of ["{", "\"sections\": {}"]) opts?.onToken?.(t);
      return JSON.stringify({ sections: {}, unparsed: "He has chest pain." });
    }
  };
  const probeNote = "He has chest pain.";
  await splitNoteSectionsWithLlm(probeClient, probeNote, "hp", {
    onToken: ({ index, token }) => tokenEvents.push({ index, token })
  });
  assert.ok(seenCalls.length >= 1, "parse calls client.chat");
  for (const call of seenCalls) {
    assert.equal(
      call.opts?.chatOpts?.extraBody?.enable_thinking,
      false,
      "parse disables chain-of-thought for deterministic extraction"
    );
    assert.equal(typeof call.opts?.onToken, "function", "parse wires onToken into client.chat");
    assert.ok(call.opts?.timeoutMs > 0, "parse sets a generation timeout so a stall fails closed");
  }
  assert.ok(tokenEvents.length > 0, "onToken events reach the caller's onToken");
  assert.ok(
    tokenEvents.every((e) => e.index === 1 && typeof e.token === "string"),
    "onToken events carry the 1-based chunk index"
  );
}

console.log("local-llm parse liveness tests passed");

// --- verifier: prompt, JSON extraction, span mapping, dedupe, soft failure -
// The LLM verifier is the WebLLM port of the wllama prototype: the local
// model rereads the note and returns PHI spans as JSON. All fixtures are
// synthetic and PHI free in the sense that they are invented test strings.
{
  // Prompt shape.
  const { system, user } = buildVerifierPrompt("Note about Jane Smith.");
  assert.ok(system.includes("ONLY a JSON array"), "system prompt demands a JSON array");
  for (const type of VERIFIER_ALLOWED_TYPES) {
    assert.ok(system.includes(type), `system prompt lists ${type}`);
  }
  assert.equal(VERIFIER_ALLOWED_TYPES.length, 15, "verifier covers the 15 PHI types");
  assert.ok(user.startsWith("NOTE:\n<<<\n"), "user message opens the note fence");
  assert.ok(user.endsWith("\n>>>"), "user message closes the note fence");
  assert.ok(user.includes("Note about Jane Smith."), "user message carries the note");

  // JSON extraction.
  assert.deepEqual(
    extractVerifierJsonArray('[{"text": "Jane Smith", "type": "PATIENT NAME"}]'),
    [{ text: "Jane Smith", type: "PATIENT NAME" }],
    "clean array parses"
  );
  assert.deepEqual(
    extractVerifierJsonArray('Here is what I found:\n[{"text": "Jane", "type": "NAME"}]\nDone.'),
    [{ text: "Jane", type: "NAME" }],
    "array wrapped in prose parses"
  );
  assert.equal(extractVerifierJsonArray("no brackets here"), null, "missing brackets fail");
  assert.equal(extractVerifierJsonArray("[not json}"), null, "malformed JSON fails");
  assert.equal(extractVerifierJsonArray('{"text": "x"}'), null, "non array JSON fails");

  // Span mapping.
  const note = "Jane Smith saw Dr. Alan Ortiz. Jane Smith returns tomorrow.";
  const mapped = mapVerifierSpansToOffsets(note, [
    { text: "Jane Smith", type: "PATIENT NAME" },
    { text: "Alan Ortiz", type: "PROVIDER NAME" },
    { text: "Nobody Here", type: "NAME" },
    { text: "Jane Smith", type: "NOT A TYPE" },
    { text: "", type: "NAME" }
  ]);
  assert.equal(mapped.entities.length, 3, "two occurrences of Jane Smith plus Alan Ortiz");
  assert.deepEqual(
    mapped.entities[0],
    { start: 0, end: 10, label: "PATIENT NAME", source: VERIFIER_SOURCE, confidence: VERIFIER_CONFIDENCE },
    "first occurrence maps to offsets"
  );
  assert.deepEqual(
    [mapped.entities[0].start, mapped.entities[1].start, mapped.entities[2].start],
    [0, 31, 19],
    "repeated spans map in source order per item"
  );
  assert.equal(mapped.stats.items, 5, "stats count every predicted item");
  assert.equal(mapped.stats.unmatched, 1, "unmatched predictions are counted");
  assert.equal(mapped.stats.ambiguous, 1, "repeated spans are counted as ambiguous");
  assert.equal(mapped.stats.badType, 2, "bad types and empty text are counted");

  // Case sensitivity: the model must copy substrings exactly.
  const cased = mapVerifierSpansToOffsets("Jane smith", [{ text: "Jane Smith", type: "NAME" }]);
  assert.equal(cased.entities.length, 0, "mapping is case sensitive");
  assert.equal(cased.stats.unmatched, 1, "case mismatch counts as unmatched");

  // Dedupe against the first pass.
  const firstPass = [{ start: 0, end: 10, label: "PATIENT NAME" }];
  const verifierSpans = [
    { start: 2, end: 8, label: "NAME", source: VERIFIER_SOURCE },
    { start: 0, end: 10, label: "PATIENT NAME", source: VERIFIER_SOURCE },
    { start: 8, end: 20, label: "NAME", source: VERIFIER_SOURCE },
    { start: 30, end: 40, label: "PHONE", source: VERIFIER_SOURCE },
    { start: 50, end: 50, label: "ID", source: VERIFIER_SOURCE }
  ];
  const novel = dedupeVerifierEntities(firstPass, verifierSpans);
  assert.deepEqual(
    novel.map((e) => [e.start, e.end]),
    [[30, 40]],
    "covered, identical, and overlapping spans are dropped; disjoint and empty spans handled"
  );
  assert.deepEqual(dedupeVerifierEntities([], verifierSpans.slice(3, 4)).length, 1, "no first pass keeps disjoint spans");
  assert.deepEqual(dedupeVerifierEntities(null, null), [], "null inputs are safe");

  // Orchestration with a stubbed chat function.
  const seen = [];
  const fakeChat = async (messages, opts) => {
    seen.push({ messages, opts });
    return '[{"text": "Jane Smith", "type": "PATIENT NAME"}]';
  };
  const ok = await runLlmVerifier(fakeChat, note);
  assert.equal(ok.entities.length, 2, "orchestrator maps stubbed JSON to entities");
  assert.equal(ok.stats.parseFailed, false, "clean run is not a parse failure");
  assert.equal(ok.stats.error, "", "clean run has no error");
  assert.equal(seen.length, 1, "one model call per verification");
  assert.equal(seen[0].messages.length, 2, "system plus user messages");
  assert.equal(seen[0].opts.temperature, 0, "verification is deterministic");
  assert.equal(
    seen[0].opts.chatOpts?.extraBody?.enable_thinking,
    false,
    "verification disables chain of thought so the token budget goes to JSON"
  );
  assert.ok(seen[0].opts.timeoutMs > 0, "verification sets a generation timeout");
  assert.ok(seen[0].opts.maxTokens > 0, "verification sets an output budget");

  // Soft failure: the chat throws.
  const failing = await runLlmVerifier(async () => { throw new Error("engine exploded"); }, note);
  assert.deepEqual(failing.entities, [], "chat failure yields no entities");
  assert.match(failing.stats.error, /engine exploded/, "chat failure reason is reported");

  // Soft failure: unparseable model output.
  const garbled = await runLlmVerifier(async () => "no json here", note);
  assert.deepEqual(garbled.entities, [], "unparseable output yields no entities");
  assert.equal(garbled.stats.parseFailed, true, "unparseable output is flagged");

  // Long notes are truncated with disclosure.
  const long = await runLlmVerifier(fakeChat, "x".repeat(VERIFIER_MAX_NOTE_CHARS + 10));
  assert.equal(long.stats.truncated, true, "overlong notes are truncated");
  assert.ok(
    seen[seen.length - 1].messages[1].content.length <= VERIFIER_MAX_NOTE_CHARS + 20,
    "truncated note fits the context budget"
  );
}

console.log("local-llm verifier tests passed");
