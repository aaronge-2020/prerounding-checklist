// Writer AI feedback: pure prompt assembly, feedback parsing, scope
// selection, engine preference, panel rendering, and controller behavior
// with fake engines. No network, no real model, no DOM rendering of the app.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FEEDBACK_KINDS,
  WRITER_FEEDBACK_SCHEMA,
  buildFeedbackSections,
  buildWriterFeedbackPrompt,
  parseWriterFeedback,
  resolveScopedSection,
  sectionsInScope
} from "../src/note-drafts/feedback.js";
import {
  FEEDBACK_ENGINE_STORAGE_KEY,
  loadPersistedFeedbackEngine,
  persistFeedbackEngine
} from "../src/app/feedback-preference.js";
import { renderWriterFeedbackPanel } from "../src/ui/writer-feedback/presentation.js";
import { createWriterFeedbackController } from "../src/ui/writer-feedback/controller.js";
import {
  NOTE_TYPES,
  addPlanProblem,
  createNoteDraft,
  studentGuidance,
  updateAssessment,
  updateClosingSection,
  updateNoteSection
} from "../src/note-drafts/index.js";

const escapeHtml = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- sections
let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { patientId: "p1" });
draft = updateNoteSection(draft, "one_liner", "62M with chest pain, likely NSTEMI.");
draft = updateNoteSection(draft, "history_of_present_illness", "Pain started yesterday at rest.");
draft = updateAssessment(draft, "NSTEMI, troponin rising.");
draft = updateClosingSection(draft, "code_status", "Full code.");
draft = addPlanProblem(draft, { problem: "NSTEMI", diagnosticPlan: "Serial troponins.", therapeuticPlan: "Heparin drip." });

const sections = buildFeedbackSections(draft);
const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
assert.equal(byId.one_liner.text, "62M with chest pain, likely NSTEMI.");
assert.equal(byId.one_liner.label, "One-liner");
assert.equal(byId.one_liner.canApply, true);
assert.equal(byId.assessment.text, "NSTEMI, troponin rising.");
assert.equal(byId.assessment.canApply, true);
assert.equal(byId.code_status.text, "Full code.");
assert.equal(byId.code_status.canApply, true);
assert.match(byId.plan.text, /NSTEMI/);
assert.match(byId.plan.text, /Heparin drip/);
assert.equal(byId.plan.canApply, false, "plan feedback is comment-only: problems are structured, not one text field");
assert.equal(byId.social_history.text, "", "empty sections are still listed so scope can pick them");

// ------------------------------------------------------------------- scope
const whole = sectionsInScope(sections, "whole", "");
assert.deepEqual(
  whole.map((section) => section.id),
  ["one_liner", "history_of_present_illness", "assessment", "plan", "code_status"],
  "whole note keeps written sections plus the core one-liner and assessment, in writer order"
);
const emptyDraftSections = buildFeedbackSections(createNoteDraft(NOTE_TYPES.PROGRESS, { patientId: "p2" }));
assert.deepEqual(
  sectionsInScope(emptyDraftSections, "whole", "").map((section) => section.id),
  ["one_liner", "assessment"],
  "an empty note still scopes to the two core sections so the model can flag them missing"
);
assert.deepEqual(sectionsInScope(sections, "section", "history_of_present_illness").map((s) => s.id), ["history_of_present_illness"]);
assert.deepEqual(sectionsInScope(sections, "section", "social_history").map((s) => s.id), ["social_history"], "this-section scope can target an empty section");
assert.deepEqual(sectionsInScope(sections, "section", "").map((s) => s.id), ["one_liner"], "no last section falls back to the first written section");
assert.deepEqual(sectionsInScope(sections, "bogus", "").map((s) => s.id), whole.map((s) => s.id), "unknown scope behaves as whole note");

// ------------------------------------------------------------------ prompt
const prompt = buildWriterFeedbackPrompt({ noteType: NOTE_TYPES.H_AND_P, sections: whole });
assert.match(prompt.instructions, /writing coach/i);
assert.match(prompt.instructions, /Do not invent clinical facts/);
assert.match(prompt.input, /One-liner/);
assert.match(prompt.input, /62M with chest pain/);
assert.ok(prompt.input.includes(studentGuidance(NOTE_TYPES.H_AND_P, "one_liner")), "prompt carries the one-liner standard");
assert.ok(prompt.input.includes(studentGuidance(NOTE_TYPES.H_AND_P, "history_of_present_illness")), "prompt carries the HPI standard");
assert.ok(!prompt.input.includes(studentGuidance(NOTE_TYPES.H_AND_P, "social_history")), "out-of-scope standards stay out of the prompt");
assert.ok(!prompt.input.includes("Social history"), "out-of-scope sections stay out of the prompt");
const singlePrompt = buildWriterFeedbackPrompt({ noteType: NOTE_TYPES.H_AND_P, sections: sectionsInScope(sections, "section", "history_of_present_illness") });
assert.ok(!singlePrompt.input.includes("62M with chest pain"), "this-section prompt excludes the one-liner text");
assert.equal(WRITER_FEEDBACK_SCHEMA.type, "object");
assert.ok(WRITER_FEEDBACK_SCHEMA.required.includes("items"));
assert.deepEqual(FEEDBACK_KINDS, ["works", "unclear", "missing"]);

// ------------------------------------------------------------------ parser
const allowed = whole.map((section) => section.id);
const good = JSON.stringify({
  items: [
    { section: "one_liner", kind: "works", comment: "Names the patient, the problem, and the leading diagnosis." },
    { section: "history_of_present_illness", kind: "unclear", comment: "Say when the pain changed.", rewrite: "Pain started yesterday at rest and eased after one hour." },
    { section: "plan", kind: "Missing", comment: "No follow-up interval for troponins." }
  ]
});
const parsed = parseWriterFeedback(good, { sectionIds: allowed });
assert.equal(parsed.items.length, 3);
assert.equal(parsed.items[0].kind, "works");
assert.equal(parsed.items[1].rewrite, "Pain started yesterday at rest and eased after one hour.");
assert.equal(parsed.items[2].kind, "missing", "kind matching is case-insensitive");
assert.ok(parsed.items.every((item) => item.id), "each item gets a stable id");
assert.deepEqual(parseWriterFeedback({ items: [] }, { sectionIds: allowed }), { items: [] }, "an empty items list is a valid, readable reply");
assert.equal(parseWriterFeedback("```json\n" + good + "\n```", { sectionIds: allowed }).items.length, 3, "code fences are stripped");
assert.throws(() => parseWriterFeedback("The note looks fine overall.", { sectionIds: allowed }), /could not be read as feedback/);
assert.throws(() => parseWriterFeedback("{not json", { sectionIds: allowed }), /could not be read as feedback/);
assert.throws(() => parseWriterFeedback(JSON.stringify({ items: [{ section: "nope", kind: "works", comment: "x" }] }), { sectionIds: allowed }), /could not be read as feedback/, "items about unknown sections leave nothing readable");
const mixed = parseWriterFeedback(JSON.stringify({ items: [
  { section: "nope", kind: "works", comment: "Unknown section." },
  { section: "one_liner", kind: "works", comment: "Known section." },
  { section: "one_liner", kind: "bogus", comment: "Unknown kind." },
  { section: "one_liner", kind: "works", comment: "" }
] }), { sectionIds: allowed });
assert.equal(mixed.items.length, 1, "unknown sections, unknown kinds, and empty comments are dropped");
assert.equal(mixed.items[0].comment, "Known section.");

// ------------------------------------------------------- engine preference
const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
{
  const storage = memoryStorage();
  assert.equal(loadPersistedFeedbackEngine(storage), "local", "on device is the default engine");
  persistFeedbackEngine(storage, "openai");
  assert.equal(storage.getItem(FEEDBACK_ENGINE_STORAGE_KEY), "openai");
  assert.equal(loadPersistedFeedbackEngine(storage), "openai", "the chosen engine round-trips");
  persistFeedbackEngine(storage, "carrier-pigeon");
  assert.equal(loadPersistedFeedbackEngine(storage), "openai", "an unknown engine is never stored");
  storage.setItem(FEEDBACK_ENGINE_STORAGE_KEY, "carrier-pigeon");
  assert.equal(loadPersistedFeedbackEngine(storage), "local", "an unknown stored engine falls back to on device");
  assert.equal(loadPersistedFeedbackEngine(null), "local");
  persistFeedbackEngine(null, "openai");
}

// -------------------------------------------------------------- presentation
const baseVm = {
  open: true, scope: "whole", engine: "local", running: false,
  statusText: "", error: "", notice: null, items: [], lastSectionLabel: "History of present illness"
};
assert.equal(renderWriterFeedbackPanel({ ...baseVm, open: false }, escapeHtml), "", "a closed panel renders nothing");
const panelHtml = renderWriterFeedbackPanel({
  ...baseVm,
  items: [
    { id: "item-1", sectionId: "history_of_present_illness", sectionLabel: "History of present illness", kind: "unclear", kindLabel: "Unclear", comment: "Say when the pain changed.", rewrite: "Pain started yesterday at rest.", canApply: true },
    { id: "item-2", sectionId: "plan", sectionLabel: "Plan", kind: "missing", kindLabel: "Missing", comment: "No troponin interval.", rewrite: "Repeat troponin in 3 hours.", canApply: false },
    { id: "item-3", sectionId: "one_liner", sectionLabel: "One-liner", kind: "works", kindLabel: "Works", comment: "<script>alert(1)</script>", rewrite: "", canApply: true }
  ]
}, escapeHtml);
assert.match(panelHtml, /Get AI feedback|AI feedback/);
assert.match(panelHtml, /History of present illness/);
assert.match(panelHtml, /Unclear/);
assert.match(panelHtml, /Say when the pain changed/);
assert.match(panelHtml, /data-wf-action="wf-apply" data-wf-item="item-1"/);
assert.match(panelHtml, /data-wf-action="wf-dismiss" data-wf-item="item-1"/);
assert.doesNotMatch(panelHtml, /data-wf-action="wf-apply" data-wf-item="item-2"/, "plan items offer no Apply: the plan is structured problems");
assert.doesNotMatch(panelHtml, /<script>/, "feedback text is escaped");
assert.match(panelHtml, /not saved/i, "the panel states feedback is not saved");
const runningHtml = renderWriterFeedbackPanel({ ...baseVm, running: true, statusText: "Reading your note on this device." }, escapeHtml);
assert.match(runningHtml, /data-wf-action="wf-stop"/);
assert.match(runningHtml, /Reading your note on this device/);
assert.doesNotMatch(runningHtml, /data-wf-action="wf-run"/, "no second run while one is running");
const noticeHtml = renderWriterFeedbackPanel({ ...baseVm, notice: { text: "No on-device model is ready yet.", action: "wf-get-model", actionLabel: "Get a model" } }, escapeHtml);
assert.match(noticeHtml, /No on-device model is ready yet/);
assert.match(noticeHtml, /data-wf-action="wf-get-model"/);

// --------------------------------------------------------------- controller
function fakeDeps(overrides = {}) {
  const calls = { applied: [], statuses: [], renders: 0, views: [] };
  const storage = memoryStorage();
  const deps = {
    storage,
    getContext: () => ({ patientId: "p1", packetId: "admission", noteType: NOTE_TYPES.H_AND_P, draft }),
    getLastSectionId: () => "history_of_present_illness",
    applyRewrite: (sectionId, text) => { calls.applied.push([sectionId, text]); return true; },
    rerender: () => { calls.renders += 1; },
    setStatus: (message) => { calls.statuses.push(message); },
    preferences: () => ({}),
    openModelMenu: () => { calls.views.push("model"); },
    openSettings: () => { calls.views.push("settings"); },
    localClient: {
      getStatus: () => ({ status: "idle", verified: false, activeModelKey: "" }),
      chat: async () => { throw new Error("should not be called"); },
      resetChat: async () => {}
    },
    ...overrides
  };
  return { deps, calls, storage };
}

{ // No model ready: plain notice, no silent failure, no chat call.
  const { deps, calls } = fakeDeps();
  const controller = createWriterFeedbackController(deps);
  controller.handleAction("wf-open", {});
  assert.equal(controller.viewModel().open, true);
  await controller.run();
  assert.equal(controller.viewModel().notice?.action, "wf-get-model");
  assert.match(controller.viewModel().notice.text, /No on-device model is ready yet/);
  assert.equal(controller.viewModel().error, "");
  controller.handleAction("wf-get-model", {});
  assert.deepEqual(calls.views, ["model"]);
  controller.clear();
  assert.equal(controller.viewModel().open, false, "clear closes the panel");
  assert.equal(controller.viewModel().notice, null);
}

{ // OpenAI chosen but no key saved: plain notice pointing at Settings.
  const { deps, calls } = fakeDeps();
  const controller = createWriterFeedbackController(deps);
  controller.handleAction("wf-engine", { wfEngine: "openai" });
  assert.equal(controller.viewModel().engine, "openai");
  assert.equal(loadPersistedFeedbackEngine(deps.storage), "openai", "the engine switch persists");
  await controller.run();
  assert.equal(controller.viewModel().notice?.action, "wf-open-settings");
  assert.match(controller.viewModel().notice.text, /Settings/);
  controller.handleAction("wf-open-settings", {});
  assert.deepEqual(calls.views, ["settings"]);
}

{ // Local run with a ready fake model: items parse, apply and dismiss work.
  const { deps, calls } = fakeDeps({
    localClient: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "fake" }),
      chat: async (messages) => {
        assert.match(messages[1].content, /History of present illness/);
        return good;
      },
      resetChat: async () => {}
    }
  });
  const controller = createWriterFeedbackController(deps);
  controller.handleAction("wf-scope", { wfScope: "section" });
  assert.equal(controller.viewModel().scope, "section");
  await controller.run();
  const vm = controller.viewModel();
  assert.equal(vm.error, "");
  assert.equal(vm.items.length, 1, "this-section scope keeps only that section's feedback");
  const hpi = vm.items.find((item) => item.sectionId === "history_of_present_illness");
  assert.equal(hpi.canApply, true);
  controller.handleAction("wf-apply", { wfItem: hpi.id });
  assert.deepEqual(calls.applied, [["history_of_present_illness", "Pain started yesterday at rest and eased after one hour."]]);
  assert.equal(controller.viewModel().items.some((item) => item.id === hpi.id), false, "an applied item leaves the list");
  controller.handleAction("wf-scope", { wfScope: "whole" });
  await controller.run();
  assert.equal(controller.viewModel().items.length, 3, "whole-note scope lists feedback for every section in scope");
  const first = controller.viewModel().items[0];
  controller.handleAction("wf-dismiss", { wfItem: first.id });
  assert.equal(controller.viewModel().items.some((item) => item.id === first.id), false, "dismiss removes the item");
  controller.clear();
  assert.deepEqual(controller.viewModel().items, [], "clear drops feedback: it is session-only");
}

{ // Malformed model output becomes one plain error, never raw model text.
  const { deps } = fakeDeps({
    localClient: {
      getStatus: () => ({ status: "ready", verified: true, activeModelKey: "fake" }),
      chat: async () => "The note looks fine overall, nice work.",
      resetChat: async () => {}
    }
  });
  const controller = createWriterFeedbackController(deps);
  await controller.run();
  assert.match(controller.viewModel().error, /could not be read as feedback/);
  assert.deepEqual(controller.viewModel().items, []);
}

// ------------------------------------------------- usability fixes U1-U5
// U1: the This-section label must always name the section a run will grade,
// including after a patient switch and on a new empty note. One resolver in
// the pure module decides the section for both the run and the label.
assert.equal(typeof resolveScopedSection, "function", "U1: the pure module exports the scope resolver");
assert.equal(resolveScopedSection(sections, "history_of_present_illness").id, "history_of_present_illness");
assert.deepEqual(resolveScopedSection(sections, ""), sectionsInScope(sections, "section", "")[0], "U1: the resolver matches the run when nothing was edited");
assert.deepEqual(resolveScopedSection(sections, "objective"), sectionsInScope(sections, "section", "objective")[0], "U1: a tracked section outside the graded list resolves to the same fallback the run grades");
assert.deepEqual(resolveScopedSection(emptyDraftSections, ""), sectionsInScope(emptyDraftSections, "section", "")[0], "U1: an empty note resolves to the first section the run will grade");
assert.equal(resolveScopedSection([], ""), null, "U1: no sections resolves to nothing");

{ // Patient switch: the review controller calls clear() and resets the
  // tracked section; the scope stays on This section. The label must name
  // the new patient's graded section, never blank, never the old patient's.
  let ctx = { patientId: "p1", packetId: "admission", noteType: NOTE_TYPES.H_AND_P, draft };
  let lastId = "history_of_present_illness";
  const { deps } = fakeDeps({ getContext: () => ctx, getLastSectionId: () => lastId });
  const controller = createWriterFeedbackController(deps);
  controller.handleAction("wf-scope", { wfScope: "section" });
  assert.equal(controller.viewModel().lastSectionLabel, "History of present illness");
  controller.clear();
  const newDraft = createNoteDraft(NOTE_TYPES.PROGRESS, { patientId: "p9" });
  ctx = { patientId: "p9", packetId: "admission", noteType: NOTE_TYPES.PROGRESS, draft: newDraft };
  lastId = "";
  controller.handleAction("wf-open", {});
  const vm = controller.viewModel();
  const graded = sectionsInScope(buildFeedbackSections(newDraft), "section", "")[0];
  assert.ok(graded, "U1: an empty note still has a section the run will grade");
  assert.equal(vm.scope, "section", "U1: the scope choice itself survives the switch");
  assert.equal(vm.lastSectionLabel, graded.label, "U1: after a patient switch the label names the section the run will grade");
  const html = renderWriterFeedbackPanel(vm, escapeHtml);
  assert.ok(html.includes(`This section: ${graded.label}`), "U1: the scope button names the graded section after a switch");
}

// U4: in Whole note scope the panel names the sections a run will grade,
// derived from the same sectionsInScope call the run makes.
{
  const { deps } = fakeDeps();
  const controller = createWriterFeedbackController(deps);
  const vm = controller.viewModel();
  const expectedLabels = sectionsInScope(sections, "whole", "").map((section) => section.label);
  assert.deepEqual(vm.wholeSectionLabels, expectedLabels, "U4: the view model carries the whole-note section labels from sectionsInScope");
  const html = renderWriterFeedbackPanel({ ...vm, open: true }, escapeHtml);
  const line = html.match(/Whole note grades:[^<]*/)?.[0] || "";
  assert.ok(line, "U4: whole-note scope shows a line naming the graded sections");
  for (const label of expectedLabels) assert.ok(line.includes(label), `U4: the whole-note line names ${label}`);
  const sectionHtml = renderWriterFeedbackPanel({ ...vm, open: true, scope: "section" }, escapeHtml);
  assert.doesNotMatch(sectionHtml, /Whole note grades:/, "U4: the whole-note list shows only in whole-note scope");
}

// U3: each engine states its cost and needs before Run is pressed.
{
  const localHtml = renderWriterFeedbackPanel({ ...baseVm, engine: "local", localModelReady: false }, escapeHtml);
  assert.match(localHtml, /runs on this device/i, "U3: the on-device line says the run stays on this device");
  assert.match(localHtml, /downloaded model/i, "U3: the on-device line says a downloaded model is needed");
  assert.match(localHtml, /No model is ready yet/i, "U3: the on-device line reflects readiness when no model is ready");
  const localReadyHtml = renderWriterFeedbackPanel({ ...baseVm, engine: "local", localModelReady: true }, escapeHtml);
  assert.match(localReadyHtml, /downloaded model/i, "U3: the on-device line still names the downloaded model when one is ready");
  assert.doesNotMatch(localReadyHtml, /No model is ready yet/i, "U3: a ready model is not described as missing");
  const openAiHtml = renderWriterFeedbackPanel({ ...baseVm, engine: "openai" }, escapeHtml);
  assert.match(openAiHtml, /review the exact text before it sends/i, "U3: the OpenAI privacy line stays");
  assert.match(openAiHtml, /your saved key/i, "U3: the OpenAI line says the user's saved key is used");
  assert.match(openAiHtml, /OpenAI charges/i, "U3: the OpenAI line says OpenAI charges for use");
}

// U2: Open Settings must land on the OpenAI key field. The navigation is a
// review-controller wiring concern, so this is a source contract in the
// style of the repo's other wiring checks; the browser check verifies the
// landing itself.
{
  const reviewControllerSource = await readFile(new URL("../src/ui/review/controller.js", import.meta.url), "utf8");
  const start = reviewControllerSource.indexOf("openSettings: () =>");
  assert.ok(start >= 0, "U2: the review controller wires Open Settings");
  const body = reviewControllerSource.slice(start, start + 700);
  assert.match(body, /openAiApiKeyInput/, "U2: Open Settings targets the OpenAI key field by its id");
  assert.match(body, /scrollIntoView/, "U2: Open Settings scrolls the key field into view");
  const settingsSource = await readFile(new URL("../src/ui/settings/presentation.js", import.meta.url), "utf8");
  assert.match(settingsSource, /id="openAiApiKeyInput"/, "U2: the key field keeps the stable id Open Settings targets");
}

// U5: the feedback button is set apart from the export cluster. Placement
// and styling live in the review presentation and styles.css, so these are
// source contracts; the browser check verifies the rendered toolbar.
{
  const reviewPresentationSource = await readFile(new URL("../src/ui/review/presentation.js", import.meta.url), "utf8");
  const toggleAt = reviewPresentationSource.indexOf('data-wf-action="wf-toggle"');
  assert.ok(toggleAt >= 0, "U5: the toolbar still carries the feedback toggle");
  const toggleTag = reviewPresentationSource.slice(reviewPresentationSource.lastIndexOf("<button", toggleAt), toggleAt);
  assert.match(toggleTag, /wf-open-btn/, "U5: the feedback button carries its own styling class");
  const exportsAt = reviewPresentationSource.indexOf("note-editor-exports");
  assert.ok(exportsAt >= 0, "U5: the export buttons sit in their own named group");
  assert.ok(exportsAt < reviewPresentationSource.indexOf("copy-final-note"), "U5: the exports group wraps the Copy actions");
  const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(stylesSource, /\.wf-open-btn/, "U5: styles.css styles the feedback button apart");
  assert.match(stylesSource, /\.note-editor-exports/, "U5: styles.css styles the exports group apart");
}

console.log("test-writer-feedback: all assertions passed");
