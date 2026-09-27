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

console.log("local LLM tests passed");
