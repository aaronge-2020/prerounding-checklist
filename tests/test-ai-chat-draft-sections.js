// Regression tests for granular draft-note context in AI Chat:
//
// Aaron's requirement: selecting what part of the draft note goes into AI
// Chat must be granular — the one-liner alone, or the context of a specific
// plan problem. This covers:
//
//   Part 1  src/note-drafts/render.js - renderNoteSectionEntries
//   Part 2  src/local-llm/patient-context.js - per-section pieces/pieceText
//   Part 3  src/ui/ai-chat/delta-review.js - split/verify with selection subsets
//   Part 4  src/ui/ai-chat/presentation.js - every piece selectable in ChatGPT mode
//   Part 5  src/ui/ai-chat/controller.js - end-to-end: the ChatGPT review
//           follows the shared selection (chart pieces deselectable, bare
//           questions get the general-knowledge prompt), and the meter
//           tracks it.
//
// All fixtures are synthetic and PHI-free ("CanaryName" is the canary the
// de-id stub redacts).

import assert from "node:assert/strict";

import {
  NOTE_TYPES,
  addPlanProblem,
  createNoteDraft,
  updateAssessment,
  updateNoteSection
} from "../src/note-drafts/index.js";
import {
  renderFinalNotePlainText,
  renderNoteSectionEntries
} from "../src/note-drafts/render.js";
import {
  buildPatientContextFromPieces,
  listPatientContextPieces,
  pieceText
} from "../src/local-llm/patient-context.js";
import {
  splitBuiltContext,
  verifySplitEquivalence
} from "../src/ui/ai-chat/delta-review.js";
import { createAiChatPresentation } from "../src/ui/ai-chat/presentation.js";
import { createAiChatController } from "../src/ui/ai-chat/controller.js";

const FIXED_TIME = 1759094400000;
const fixedNow = () => FIXED_TIME;
let idSeq = 0;
const fixedId = () => `test-id-${++idSeq}`;
const draftOptions = { now: fixedNow, idFactory: fixedId };

function draftFixture() {
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...draftOptions, id: "draft-sections-fixture" });
  draft = updateNoteSection(draft, "one_liner", "CanaryName is a 65M with one-liner-marker-word", { now: fixedNow });
  draft = updateNoteSection(draft, "patient_report", "Reports feeling better.", { now: fixedNow });
  draft = updateAssessment(draft, "Improving overall.", { now: fixedNow });
  draft = addPlanProblem(draft, {
    id: "problem_aki",
    problem: "Acute kidney injury",
    keyContext: "aki-problem-marker-word creatinine rising"
  }, draftOptions);
  draft = addPlanProblem(draft, {
    id: "problem_anemia",
    problem: "Anemia",
    keyContext: "anemia-problem-marker-word iron deficiency"
  }, draftOptions);
  return draft;
}

function chartPatientFixture() {
  return {
    id: "patient-1",
    displayLabel: "WH Timeline",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { id: "hpi", label: "History of present illness", sourceKind: "primary_note", deidentifiedText: "Patient CanaryName presents with chest pain." }
    ],
    days: []
  };
}

// ---------------------------------------------------------------------------
// Part 1: renderNoteSectionEntries
// ---------------------------------------------------------------------------

{
  const draft = draftFixture();
  const entries = renderNoteSectionEntries(draft);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  const oneLiner = byKey.get("section:one-liner");
  assert.ok(oneLiner, "one-liner is its own entry");
  assert.equal(oneLiner.label, "One-Liner");
  assert.ok(oneLiner.text.includes("one-liner-marker-word"), "one-liner entry carries the one-liner text");

  const aki = byKey.get("plan:acute-kidney-injury");
  const anemia = byKey.get("plan:anemia");
  assert.ok(aki && anemia, "each plan problem is its own entry");
  assert.equal(aki.label, "Plan — Acute kidney injury");
  assert.equal(anemia.label, "Plan — Anemia");
  assert.ok(aki.text.includes("aki-problem-marker-word"), "AKI entry carries the AKI context");
  assert.ok(!aki.text.includes("anemia-problem-marker-word"), "AKI entry excludes the anemia context");
  assert.ok(anemia.text.includes("anemia-problem-marker-word"), "anemia entry carries the anemia context");
  assert.ok(!anemia.text.includes("aki-problem-marker-word"), "anemia entry excludes the AKI context");

  // Same rendering pipeline as the final note: every entry's text appears
  // verbatim in the whole-note plain text, which itself is unchanged.
  const wholeNote = renderFinalNotePlainText(draft);
  for (const entry of entries) {
    assert.ok(wholeNote.includes(entry.text), `entry ${entry.key} appears verbatim in the whole note`);
  }
  assert.ok(wholeNote.includes("one-liner-marker-word"), "whole note still contains the one-liner");
  assert.ok(wholeNote.includes("aki-problem-marker-word"), "whole note still contains the AKI problem");
}

{
  // Hidden/empty sections never surface as entries.
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...draftOptions, id: "one-liner-only" });
  draft = updateNoteSection(draft, "one_liner", "Just the one-liner", { now: fixedNow });
  const entries = renderNoteSectionEntries(draft);
  assert.deepEqual(entries.map((entry) => entry.key), ["section:one-liner"]);
}

{
  // Duplicate problem names get unique keys, in order.
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...draftOptions, id: "dup-problems" });
  draft = updateNoteSection(draft, "one_liner", "x", { now: fixedNow });
  draft = addPlanProblem(draft, { id: "problem_a1", problem: "Anemia", keyContext: "first" }, draftOptions);
  draft = addPlanProblem(draft, { id: "problem_a2", problem: "Anemia", keyContext: "second" }, draftOptions);
  const entries = renderNoteSectionEntries(draft);
  const planKeys = entries.filter((entry) => entry.key.startsWith("plan:")).map((entry) => entry.key);
  assert.deepEqual(planKeys, ["plan:anemia", "plan:anemia-2"]);
}

console.log("Part 1 passed: renderNoteSectionEntries is granular and pipeline-identical");

// ---------------------------------------------------------------------------
// Part 2: patient-context pieces
// ---------------------------------------------------------------------------

{
  const patient = chartPatientFixture();
  const sections = renderNoteSectionEntries(draftFixture());
  const pieces = listPatientContextPieces(patient, { draftNoteSections: sections });
  const draftPieces = pieces.filter((piece) => piece.kind === "draft_note");
  assert.equal(draftPieces.length, sections.length, "one piece per draft section");
  for (const entry of sections) {
    const piece = draftPieces.find((candidate) => candidate.id === `draft:${entry.key}`);
    assert.ok(piece, `section ${entry.key} has piece id draft:${entry.key}`);
    assert.equal(piece.sectionKey, entry.key);
    assert.equal(pieceText(patient, piece, { draftNoteSections: sections }), entry.text, "pieceText resolves the exact section text");
  }

  // Selecting only the one-liner assembles only the one-liner.
  const oneLinerOnly = buildPatientContextFromPieces(
    patient,
    ["draft:section:one-liner"],
    { draftNoteText: renderFinalNotePlainText(draftFixture()), draftNoteSections: sections }
  );
  assert.ok(oneLinerOnly.includes("one-liner-marker-word"), "one-liner included");
  assert.ok(!oneLinerOnly.includes("aki-problem-marker-word"), "AKI problem excluded");
  assert.ok(!oneLinerOnly.includes("anemia-problem-marker-word"), "anemia problem excluded");
}

{
  // Legacy callers that only pass whole-note text keep the draft:current piece.
  const patient = chartPatientFixture();
  const pieces = listPatientContextPieces(patient, { draftNoteText: "whole note text" });
  const draftPieces = pieces.filter((piece) => piece.kind === "draft_note");
  assert.equal(draftPieces.length, 1, "legacy whole-note draft is a single piece");
  assert.equal(draftPieces[0].id, "draft:current");
  assert.ok(
    pieceText(patient, draftPieces[0], { draftNoteText: "whole note text" }).includes("whole note text"),
    "legacy piece resolves the whole-note text"
  );
}

console.log("Part 2 passed: patient-context pieces are per-section with a legacy fallback");

// ---------------------------------------------------------------------------
// Part 3: split/verify with selection subsets (fail-closed)
// ---------------------------------------------------------------------------

{
  const patient = chartPatientFixture();
  const sections = renderNoteSectionEntries(draftFixture());
  const wholeNote = renderFinalNotePlainText(draftFixture());
  const opts = { draftNoteText: wholeNote, draftNoteSections: sections };
  const chartIds = listPatientContextPieces(patient, opts)
    .filter((piece) => piece.kind !== "draft_note")
    .map((piece) => piece.id);

  // Selecting the chart plus only the one-liner: the split carries exactly that.
  const selectedIds = [...chartIds, "draft:section:one-liner"];
  const split = splitBuiltContext(patient, selectedIds, opts);
  const draftSplitPieces = split.pieces.filter((piece) => piece.kind === "draft_note");
  assert.equal(draftSplitPieces.length, 1, "subset split carries only the chosen draft section");
  assert.ok(draftSplitPieces[0].rawText.includes("one-liner-marker-word"), "split raw text is the one-liner");
  assert.equal(
    verifySplitEquivalence(patient, selectedIds, split, opts),
    true,
    "verifying against the same selection passes"
  );

  // Fail-closed: the prepared and reviewed subsets must match exactly.
  assert.equal(
    verifySplitEquivalence(patient, [...chartIds, "draft:plan:anemia"], split, opts),
    false,
    "verifying against a different selection fails closed"
  );
  assert.equal(
    verifySplitEquivalence(patient, selectedIds, split, { draftNoteText: wholeNote, draftNoteSections: null }),
    false,
    "verifying against the legacy whole-note draft fails closed"
  );

  // The assembled text carries only the chosen sections.
  const builtText = buildPatientContextFromPieces(patient, selectedIds, opts);
  assert.ok(builtText.includes("one-liner-marker-word"), "assembled text includes the one-liner");
  assert.ok(!builtText.includes("aki-problem-marker-word"), "assembled text excludes the unchosen problem");
  assert.ok(builtText.includes("chest pain"), "assembled text still grounds on the chart documents");

  // Empty selection assembles nothing — a bare question sends no context.
  const emptySplit = splitBuiltContext(patient, [], opts);
  assert.equal(emptySplit.pieces.length, 0, "empty selection splits to no pieces");
  assert.equal(buildPatientContextFromPieces(patient, [], opts), "", "empty selection assembles empty text");
  assert.equal(
    verifySplitEquivalence(patient, [], emptySplit, opts),
    true,
    "the empty split still verifies — nothing to drift"
  );
}

console.log("Part 3 passed: split/verify are fail-closed over selection subsets");

// ---------------------------------------------------------------------------
// Part 4: presentation — every piece is selectable in ChatGPT mode
// ---------------------------------------------------------------------------

const presentation = createAiChatPresentation({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  icon: () => ""
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
  patientContext: { enabled: false, available: false, label: "TR-3", hasPatient: true }
};

function granularInspectorVm({ isRemote }) {
  return {
    open: true,
    enabled: true,
    isRemote,
    hasPatient: true,
    patientLabel: "TR-3",
    pieces: [
      { id: "admission:hpi", group: "Admission", label: "History of present illness", kind: "primary_note", tokens: 100, selected: true },
      { id: "draft:section:one-liner", group: "Draft note", label: "One-Liner", kind: "draft_note", tokens: 50, selected: true },
      { id: "draft:plan:acute-kidney-injury", group: "Draft note", label: "Plan — Acute kidney injury", kind: "draft_note", tokens: 60, selected: false }
    ],
    groups: ["Admission", "Draft note"],
    guidelinesTokens: 178,
    historyTokens: 381,
    historyCount: 2,
    selectedTokens: 210,
    contextWindow: 1050000,
    windowLabel: "GPT-6 Luna"
  };
}

function pieceInput(html, id) {
  const m = html.match(new RegExp(`data-ai-chat-context-piece="${id}"[^>]*>`));
  assert.ok(m, `checkbox for ${id} rendered`);
  return m[0];
}

{
  // ChatGPT mode: every piece is selectable — only the selection is sent.
  const html = presentation.render({
    ...sidebarBase,
    mode: "remote",
    contextInspector: granularInspectorVm({ isRemote: true })
  });
  assert.ok(!pieceInput(html, "admission:hpi").includes("disabled"), "chart checkbox is live in ChatGPT mode");
  assert.ok(pieceInput(html, "admission:hpi").includes("checked"), "chart document stays selected until unchecked");
  assert.ok(!pieceInput(html, "draft:section:one-liner").includes("disabled"), "draft one-liner checkbox is live in ChatGPT mode");
  assert.ok(!pieceInput(html, "draft:plan:acute-kidney-injury").includes("disabled"), "draft problem checkbox is live in ChatGPT mode");
  // Both groups' select/deselect buttons work in ChatGPT mode.
  const draftGroupButtons = [...html.matchAll(/data-group-index="1"[^>]*>/g)];
  assert.ok(draftGroupButtons.length === 2 && draftGroupButtons.every((m) => !m[0].includes("disabled")), "draft group buttons are live in ChatGPT mode");
  const admissionGroupButtons = [...html.matchAll(/data-group-index="0"[^>]*>/g)];
  assert.equal(admissionGroupButtons.length, 2, "admission group buttons render in ChatGPT mode");
  const admissionDeselect = admissionGroupButtons.find((m) => m[0].includes('data-select="0"'));
  assert.ok(admissionDeselect && !admissionDeselect[0].includes("disabled"), "chart group Deselect all is live in ChatGPT mode");
  assert.ok(html.includes("Only the selected context above is sent"), "sidebar explains selection-only sending");
}

{
  // On-device mode is unchanged: everything selectable.
  const html = presentation.render({
    ...sidebarBase,
    mode: "local",
    contextInspector: granularInspectorVm({ isRemote: false })
  });
  assert.ok(!pieceInput(html, "admission:hpi").includes("disabled"), "chart checkbox is live on-device");
  assert.ok(!pieceInput(html, "draft:plan:acute-kidney-injury").includes("disabled"), "draft checkbox is live on-device");
}

console.log("Part 4 passed: every piece is selectable in ChatGPT mode");

// ---------------------------------------------------------------------------
// Part 5: controller — the ChatGPT review follows the shared selection
// ---------------------------------------------------------------------------

function makeDeidStub() {
  return {
    STRUCTURED_DEID_MODE: "structured",
    getSelectedDeidModelStatus: () => ({ ready: true, modelKey: "stub", label: "Stub de-id model" }),
    getAdvancedDeidStatus: () => ({ label: "Stub de-id model" }),
    crossOriginIsolationBlocker: () => "",
    verifyAdvancedDeidModel: async () => {},
    preloadAdvancedDeidModel: async () => ({}),
    deidentifyText: async (rawText) => {
      const text = String(rawText);
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

function makeControllerHarness({ draftSections }) {
  const patient = chartPatientFixture();
  let html = "";
  const root = {};
  Object.defineProperty(root, "innerHTML", {
    get: () => html,
    set: (v) => { html = String(v); },
    configurable: true
  });
  const composerInput = { value: "", textContent: "" };
  root.querySelector = (sel) => (sel === "[data-ai-chat-input]" ? composerInput : null);
  const vault = { patients: [patient], activePatientId: patient.id };
  const app = { view: "aiChat", vault, deidMode: "stub-model" };
  let ctrl;
  ctrl = createAiChatController({
    app,
    byId: (id) => (id === "aiChatContent" ? root : null),
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => "",
    setStatus: () => {},
    render: () => { ctrl.render(); },
    getDraftNoteText: () => renderFinalNotePlainText(draftFixture()),
    getDraftNoteSections: () => draftSections,
    currentPreferences: () => ({ openAiApiKey: "sk-test", openAiModel: "gpt-5.4-mini", medicalService: "medicine" }),
    onChatServiceChange: () => {},
    deidDeps: makeDeidStub(),
    chatDeps: { requestOpenAiChat: async () => "ok" },
    agentDeps: { runAgent: async () => { throw new Error("not used"); } }
  });
  ctrl.click({ dataset: { action: "ai-chat-mode", mode: "remote" }, closest: (sel) => (sel === "[data-action]" ? { dataset: { action: "ai-chat-mode", mode: "remote" } } : null) });
  return { ctrl, html: () => html };
}

function pieceToggleTarget(id, checked) {
  return { matches: (sel) => sel === "[data-ai-chat-context-piece]", dataset: { aiChatContextPiece: id }, checked };
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
  const btn = { dataset: { action: "ai-chat-send-remote" }, closest: (sel) => (sel === "[data-action]" ? btn : sel === "[data-ai-chat-form]" ? form : null) };
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

function patientLine(html) {
  const m = html.match(/Patient ~([\d,]+)/);
  assert.ok(m, "meter names the patient token count");
  return Number(m[1].replace(/,/g, ""));
}

{
  const sections = renderNoteSectionEntries(draftFixture());
  const h = makeControllerHarness({ draftSections: sections });

  // Opt the draft sections in (selection defaults to the primary chart
  // piece); both modes share this selection.
  h.ctrl.change(pieceToggleTarget("draft:section:one-liner", true));
  h.ctrl.change(pieceToggleTarget("draft:plan:acute-kidney-injury", true));
  h.ctrl.change(pieceToggleTarget("draft:plan:anemia", true));
  const meterBefore = patientLine(h.html());

  // Uncheck both plan problems: the meter drops.
  h.ctrl.change(pieceToggleTarget("draft:plan:acute-kidney-injury", false));
  h.ctrl.change(pieceToggleTarget("draft:plan:anemia", false));
  const meterAfter = patientLine(h.html());
  assert.ok(meterAfter < meterBefore, `meter drops after excluding draft sections (${meterBefore} -> ${meterAfter})`);

  const review = await driveSend(h, "Summarize for me");
  assert.equal(review.phase, "ready", "review is ready");
  // approvedText is the de-identified text the review gate will transmit.
  const reviewedText = [review.guidelines?.approvedText || "", ...review.pieces.map((p) => p.approvedText || "")].join("\n");
  assert.ok(review.pieces.some((p) => p.id === "draft:section:one-liner"), "the one-liner piece is reviewed");
  assert.ok(!review.pieces.some((p) => p.id === "draft:plan:acute-kidney-injury"), "the excluded AKI piece is not reviewed");
  assert.ok(!review.pieces.some((p) => p.id === "draft:plan:anemia"), "the excluded anemia piece is not reviewed");
  assert.ok(reviewedText.includes("one-liner-marker-word"), "the one-liner rides along");
  assert.ok(reviewedText.includes("[NAME]"), "the one-liner was de-identified");
  assert.ok(!reviewedText.includes("aki-problem-marker-word"), "the excluded AKI problem text is not reviewed");
  assert.ok(!reviewedText.includes("anemia-problem-marker-word"), "the excluded anemia problem text is not reviewed");
  assert.ok(reviewedText.includes("chest pain"), "the selected chart piece still grounds the send");
  assert.ok(!reviewedText.includes("CanaryName"), "no raw canary anywhere in the reviewed text");
  assert.ok(review.systemPromptText.includes("CITATION RULES"), "citation rules present when context is attached");

  // Chart documents are deselectable too: uncheck the HPI and it leaves
  // the review while the still-selected one-liner stays.
  h.ctrl.click(actionTarget("ai-chat-new-chat-remote"));
  h.ctrl.change(pieceToggleTarget("admission:hpi", false));
  const reviewNoChart = await driveSend(h, "Question without the chart");
  assert.equal(reviewNoChart.phase, "ready", "review is ready with the chart deselected");
  const noChartText = reviewNoChart.pieces.map((p) => p.approvedText || "").join("\n");
  assert.ok(!noChartText.includes("chest pain"), "deselected chart text is not sent");
  assert.ok(noChartText.includes("one-liner-marker-word"), "the still-selected one-liner rides along");
  assert.ok(reviewNoChart.systemPromptText.includes("CITATION RULES"), "citation rules still apply to the attached one-liner");

  // Nothing selected: the question goes alone and the model answers from
  // general knowledge instead of citing chart sections.
  h.ctrl.click(actionTarget("ai-chat-new-chat-remote"));
  h.ctrl.change(pieceToggleTarget("draft:section:one-liner", false));
  const reviewBare = await driveSend(h, "Bare question");
  assert.equal(reviewBare.phase, "ready", "review is ready with nothing selected");
  assert.equal(reviewBare.pieces.length, 0, "no context pieces are reviewed");
  assert.ok(reviewBare.systemPromptText.includes("CONTEXT RULES"), "general-knowledge prompt when nothing is attached");
  assert.ok(!reviewBare.systemPromptText.includes("CITATION RULES"), "no citation rules without context");

  // Re-checking a problem opts it back in. Starting a new remote chat
  // clears the finished review so the next send re-prepares the gate.
  h.ctrl.click(actionTarget("ai-chat-new-chat-remote"));
  h.ctrl.change(pieceToggleTarget("admission:hpi", true));
  h.ctrl.change(pieceToggleTarget("draft:plan:anemia", true));
  const review2 = await driveSend(h, "Summarize again");
  assert.equal(review2.phase, "ready", "review is ready after re-including");
  const reviewedText2 = review2.pieces.map((p) => p.approvedText || "").join("\n");
  assert.ok(review2.pieces.some((p) => p.id === "draft:plan:anemia"), "re-included problem piece is reviewed");
  assert.ok(reviewedText2.includes("anemia-problem-marker-word"), "re-included problem rides along");
  assert.ok(!review2.pieces.some((p) => p.id === "draft:plan:acute-kidney-injury"), "still-excluded problem piece stays out");
  assert.ok(!reviewedText2.includes("aki-problem-marker-word"), "still-excluded problem stays out");
}

{
  // Stale selection ids (a section that no longer exists after a draft
  // edit) are pruned, not applied to the wrong section.
  let editedDraft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...draftOptions, id: "edited-draft" });
  editedDraft = updateNoteSection(editedDraft, "one_liner", "CanaryName is a 65M with one-liner-marker-word", { now: fixedNow });
  editedDraft = addPlanProblem(editedDraft, {
    id: "problem_aki",
    problem: "Acute kidney injury",
    keyContext: "aki-problem-marker-word creatinine rising"
  }, draftOptions);
  const editedSections = renderNoteSectionEntries(editedDraft);
  const h2 = makeControllerHarness({ draftSections: editedSections });
  h2.ctrl.change(pieceToggleTarget("draft:section:one-liner", true));
  h2.ctrl.change(pieceToggleTarget("draft:plan:acute-kidney-injury", true));
  h2.ctrl.change(pieceToggleTarget("draft:plan:anemia", false)); // stale id, never rendered
  const review = await driveSend(h2, "Summarize");
  assert.equal(review.phase, "ready", "review is ready with a stale selection id");
  const reviewedText = review.pieces.map((p) => p.approvedText || "").join("\n");
  assert.ok(reviewedText.includes("aki-problem-marker-word"), "stale id does not suppress the remaining problem");
}

console.log("Part 5 passed: ChatGPT review follows the shared selection and the meter tracks it");

console.log("All draft-section granularity tests passed");
