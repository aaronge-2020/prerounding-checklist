// Chart-grounded cited answers: unit tests for the pure machinery.
//
// Covers the model-grounded chart budget, the section-citation parse /
// index / chip contract, and the split/verify/transmit equivalence that
// guarantees the review gate sees exactly what the wire will carry.
// All fixtures are synthetic and PHI-free.
import assert from "node:assert/strict";

import {
  buildSectionCitationIndex,
  pieceSectionTarget,
  splitFullChartContext,
  verifyFullChartEquivalence,
  buildTransmitPayload,
  locateTruncation,
  fullChartBudgetChars,
  FULL_CHART_RESERVE_TOKENS
} from "../src/ui/ai-chat/delta-review.js";
import {
  parseSectionCitations,
  sectionCitationChipHtml,
  citedSections
} from "../src/ui/ai-chat/section-citations.js";
import { MAX_FULL_CHART_CHARS } from "../src/local-llm/patient-context.js";
import { CHARS_PER_TOKEN } from "../src/local-llm/context-budget.js";

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- Model-grounded chart budget -------------------------------------------
console.log("budget: derived from the model's real context window");
{
  // GPT-5.6-class: 1.05M tokens -> (1050000 - reserve) * chars/token.
  assert.equal(fullChartBudgetChars(1050000), Math.floor((1050000 - FULL_CHART_RESERVE_TOKENS) * CHARS_PER_TOKEN));
  // GPT-5.4-class: 400K tokens.
  assert.equal(fullChartBudgetChars(400000), Math.floor((400000 - FULL_CHART_RESERVE_TOKENS) * CHARS_PER_TOKEN));
  // Unknown model: conservative fallback, never unbounded, never zero.
  assert.equal(fullChartBudgetChars(0), MAX_FULL_CHART_CHARS);
  assert.equal(fullChartBudgetChars(undefined), MAX_FULL_CHART_CHARS);
  assert.equal(fullChartBudgetChars("nonsense"), MAX_FULL_CHART_CHARS);
  // A window smaller than the reserve still yields a usable floor.
  assert.ok(fullChartBudgetChars(1000) >= 500, "floor holds");
  console.log("ok - budget is model-grounded with a safe fallback");
}

// --- Citation parsing -------------------------------------------------------
console.log("citations: parse per [Section]: 'quote'");
{
  const single = parseSectionCitations("Note per [History of Present Illness]: 'chest pain'.");
  assert.equal(single.length, 1);
  assert.equal(single[0].section, "History of Present Illness");
  assert.equal(single[0].quote, "chest pain");

  const dbl = parseSectionCitations('per [Progress note]: "stable overnight".');
  assert.equal(dbl.length, 1);
  assert.equal(dbl[0].quote, "stable overnight");

  const multi = parseSectionCitations(
    "per [HPI]: 'a' and per [Plan]: 'b'."
  );
  assert.equal(multi.length, 2);
  assert.deepEqual(multi.map((c) => c.section), ["HPI", "Plan"]);

  assert.deepEqual(parseSectionCitations("no citations here"), []);
  assert.deepEqual(parseSectionCitations("per [HPI]: no quote marks"), []);
  assert.deepEqual(citedSections("per [HPI]: 'a' then per [HPI]: 'b'"), ["HPI"]);

  // Apostrophes inside the quote don't end the match early.
  const apostrophe = parseSectionCitations("per [HPI]: 'patient's chest pain' noted.");
  assert.equal(apostrophe.length, 1);
  assert.equal(apostrophe[0].quote, "patient's chest pain");
  const mixed = parseSectionCitations('per [Plan]: "it\'s stable" ok.');
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].quote, "it's stable");
  console.log("ok - parser handles quotes, multiples, apostrophes, and non-matches");
}

// --- Citation index: label OR title ----------------------------------------
console.log("citations: index matches reviewed pieces by label or title");
{
  // Reviewed pieces carry `title` (from prepareReviewPiece); raw context
  // targets carry `label`. Either must resolve.
  const pieces = [
    { id: "header", title: "Patient header", group: "" },
    { id: "admission:s1", title: "History of Present Illness", group: "Admission" },
    { id: "day:d1:c1", label: "Progress note", group: "Hospital day 1" }
  ];
  const index = buildSectionCitationIndex(pieces);
  const hpi = index.get("history of present illness");
  assert.ok(hpi, "title-keyed piece found");
  assert.equal(hpi.pieceId, "admission:s1");
  assert.deepEqual(hpi.target, { scope: "context", dayId: null, sectionId: "s1" });

  const prog = index.get("progress note");
  assert.ok(prog, "label-keyed piece found");
  assert.equal(prog.pieceId, "day:d1:c1");
  assert.deepEqual(prog.target, { scope: "daily", dayId: "d1", sectionId: "c1" });

  assert.ok(!index.has("patient header"), "header has no chart location: skipped");
  assert.ok(!index.has("nonexistent"), "unknown label absent");

  // First piece wins on duplicate labels.
  const dupes = [
    { id: "admission:s1", label: "HPI", group: "" },
    { id: "admission:s2", label: "HPI", group: "" }
  ];
  assert.equal(buildSectionCitationIndex(dupes).get("hpi").pieceId, "admission:s1");
  console.log("ok - index resolves titles, labels, and skips location-less pieces");
}

// --- Navigation targets ------------------------------------------------------
console.log("citations: piece ids map to chart locations");
{
  assert.deepEqual(pieceSectionTarget("admission:s1"), { scope: "context", dayId: null, sectionId: "s1" });
  assert.deepEqual(pieceSectionTarget("day:d1:c1"), { scope: "daily", dayId: "d1", sectionId: "c1" });
  assert.deepEqual(pieceSectionTarget("day:d1:quicknotes"), { scope: "daily", dayId: "d1", sectionId: null });
  assert.equal(pieceSectionTarget("header"), null);
  assert.equal(pieceSectionTarget("draft:current"), null);
  assert.equal(pieceSectionTarget(""), null);
  console.log("ok - targets cover admission, day captures, and day-level pieces");
}

// --- Chip rendering: quote stays visible ------------------------------------
console.log("citations: chips keep the quote; unmatched labels are inert");
{
  const cite = { section: "History of Present Illness", quote: "chest pain" };
  const html = sectionCitationChipHtml(cite, { pieceId: "admission:s1", label: "History of Present Illness" }, escapeHtml, 2);
  assert.ok(html.includes('data-section-cite="admission:s1"'), "chip carries the piece id");
  assert.ok(html.includes('data-message-index="2"'), "chip carries the message index");
  assert.ok(html.includes('<q class="aic-cite-quote">chest pain</q>'), "verbatim quote stays visible");

  const inert = sectionCitationChipHtml(cite, null, escapeHtml, 0);
  assert.ok(!inert.includes("data-section-cite"), "no clickable chip without a match");
  assert.ok(inert.includes("chest pain"), "quote still readable");

  const evil = sectionCitationChipHtml(
    { section: "<img src=x>", quote: "'quoted'" },
    { pieceId: "admission:s1", label: "HPI" },
    escapeHtml, 0
  );
  assert.ok(!evil.includes("<img"), "section label escaped");
  console.log("ok - chips preserve quotes and never render unmatched labels clickable");
}

// --- Split / verify equivalence ----------------------------------------------
function makePatient() {
  return {
    id: "patient-1",
    displayLabel: "Test Patient",
    metadata: { admissionDate: "01/02/2026" },
    contextSections: [
      { id: "s1", label: "History of Present Illness", sourceKind: "h_and_p", deidentifiedText: "Chest pain." },
      { id: "s2", label: "Plan", sourceKind: "h_and_p", deidentifiedText: "Admit." }
    ],
    days: [
      {
        id: "d1",
        label: "Hospital day 1",
        date: "01/02/2026",
        sourceCaptures: [
          { id: "c1", label: "Progress note", sourceKind: "progress_note", deidentifiedText: "Stable." }
        ],
        quickNotes: ["Call family"]
      }
    ]
  };
}

console.log("split: full chart round-trips; tampering fails closed");
{
  const patient = makePatient();
  const split = splitFullChartContext(patient, {});
  assert.deepEqual(
    split.pieces.map((p) => p.id),
    ["admission:s1", "admission:s2", "day:d1:c1", "day:d1:quicknotes"],
    "canonical order: admission sections, then day captures, then quick notes"
  );
  assert.ok(verifyFullChartEquivalence(patient, split, {}), "untampered split verifies");

  const tampered = { ...split, pieces: split.pieces.map((p) => ({ ...p })) };
  tampered.pieces[0] = { ...tampered.pieces[0], rawText: "TAMPERED" };
  assert.ok(!verifyFullChartEquivalence(patient, tampered, {}), "tampered piece fails verification");

  const reordered = { ...split, pieces: [...split.pieces].reverse() };
  assert.ok(!verifyFullChartEquivalence(patient, reordered, {}), "reordered pieces fail verification");
  console.log("ok - split/verify is byte-exact and fail-closed");
}

// --- Transmit: exact bytes, one wrapper --------------------------------------
console.log("transmit: exact reviewed bytes under one wrapper");
{
  const approvedById = {
    header: "PATIENT: Test Patient",
    "admission:s1": "## History of Present Illness\nChest pain."
  };
  const { input, finalUserContent } = buildTransmitPayload({
    approvedById,
    pieceOrder: ["header", "admission:s1"],
    transformedMessage: "Summarize.",
    systemPrompt: "Be helpful.",
    history: [],
    maxChars: 100000
  });
  const wrapper = "[De-identified patient context — verified by the student before sending]";
  assert.equal(finalUserContent.split(wrapper).length - 1, 1, "exactly one outer wrapper");
  assert.ok(finalUserContent.includes("## History of Present Illness\nChest pain."), "byte-exact piece text");
  assert.ok(finalUserContent.startsWith("Summarize."), "message first");

  // Truncation is located honestly: which piece, at what offset.
  // (Budgets floor at 500 chars, so the fixture stays above it.)
  const big = buildTransmitPayload({
    approvedById: { a: "x".repeat(400), b: "y".repeat(400) },
    pieceOrder: ["a", "b"],
    transformedMessage: "",
    systemPrompt: "",
    history: [],
    maxChars: 600
  });
  const loc = locateTruncation(["a", "b"], { a: "x".repeat(400), b: "y".repeat(400) }, 600);
  assert.ok(loc.truncated, "over-budget truncates");
  assert.equal(loc.cutPieceId, "b", "cut lands in the second piece");
  assert.ok(big.finalUserContent.length <= 600 + 100, "bounded output");
  console.log("ok - transmit is exact and truncation is located");
}

// --- Budget boundary: de-identification length changes near the limit -----
console.log("budget boundary: de-identification length changes near the limit");
{
  // De-identification can EXPAND text (e.g. "J. Smith" -> "[PATIENT NAME]").
  // The budget applies to the approved (post-de-id) text — the same bytes
  // the modal shows — so an expansion that pushes past the limit truncates
  // honestly and names the cut piece.
  const rawPieces = { header: "PATIENT: Test", "admission:s1": "Seen by J. Smith. " + "note ".repeat(113) };
  const approvedExpanded = {
    header: "PATIENT: Test",
    // De-id replaces a short name with a longer placeholder: the approved
    // text exceeds the budget even though the raw text fit.
    "admission:s1": "Seen by [PATIENT NAME REDACTED]. " + "note ".repeat(113)
  };
  const budget = 600;
  const expanded = buildTransmitPayload({
    approvedById: approvedExpanded,
    pieceOrder: ["header", "admission:s1"],
    transformedMessage: "",
    systemPrompt: "",
    history: [],
    maxChars: budget
  });
  const joined = `${approvedExpanded.header}\n\n${approvedExpanded["admission:s1"]}`;
  assert.ok(joined.length > budget, "approved text exceeds the budget");
  assert.equal(expanded.contextText, `${joined.slice(0, budget - 3).trimEnd()}...`, "contextText is the budget-truncated approved text");
  const loc = locateTruncation(["header", "admission:s1"], approvedExpanded, budget);
  assert.ok(loc.truncated, "expansion triggers truncation");
  assert.equal(loc.cutPieceId, "admission:s1", "cut piece named on expansion");
  // The raw-length budget would NOT have truncated here — the approved
  // text, not the raw text, is what the wire carries.
  const rawJoined = `${rawPieces.header}\n\n${rawPieces["admission:s1"]}`;
  assert.ok(rawJoined.length <= budget, "raw text fits under the same budget");

  // De-identification can also SHRINK text: no truncation is reported and
  // the full approved text goes through byte-exact.
  const approvedShrunk = { header: "PATIENT: Test", "admission:s1": "Seen." };
  const shrunk = buildTransmitPayload({
    approvedById: approvedShrunk,
    pieceOrder: ["header", "admission:s1"],
    transformedMessage: "",
    systemPrompt: "",
    history: [],
    maxChars: budget
  });
  const shrunkJoined = `${approvedShrunk.header}\n\n${approvedShrunk["admission:s1"]}`;
  assert.equal(shrunk.contextText, shrunkJoined, "shrunk approved text passes through untruncated");
  const locShrunk = locateTruncation(["header", "admission:s1"], approvedShrunk, budget);
  assert.ok(!locShrunk.truncated, "no truncation reported when the approved text fits");
  console.log("ok - de-id length changes truncate honestly against approved bytes");
}

// --- Modal-visible bytes equal transmitted bytes ----------------------------
console.log("transmit: modal-visible bytes equal transmitted bytes");
{
  const approvedById = {
    header: "PATIENT: Test Patient",
    "admission:s1": "## History of Present Illness\nChest pain."
  };
  const payload = buildTransmitPayload({
    approvedById,
    pieceOrder: ["header", "admission:s1"],
    transformedMessage: "Summarize.",
    systemPrompt: "Be helpful.",
    history: [],
    maxChars: 100000
  });
  // The modal shows review.transmitText (= payload.contextText); the wire
  // carries payload.input. The user content must embed exactly the shown
  // context bytes — no more, no less — under exactly one wrapper.
  const wrapper = "[De-identified patient context — verified by the student before sending]";
  const occurrences = payload.finalUserContent.split(wrapper).length - 1;
  assert.equal(occurrences, 1, "exactly one wrapper in the transmitted content");
  const afterWrapper = payload.finalUserContent.split(wrapper)[1];
  assert.ok(afterWrapper.includes(payload.contextText), "transmitted content embeds the exact modal-visible bytes");
  // Nothing outside the approved pieces rides along: every non-empty line
  // of the context text comes from an approved piece.
  const approvedText = Object.values(approvedById).join("\n\n");
  for (const line of payload.contextText.split("\n")) {
    if (line.trim()) assert.ok(approvedText.includes(line.trim()), `context line comes from an approved piece: ${line.slice(0, 40)}`);
  }
  // Truncated transmit: the modal shows the truncated text and the
  // transmitted content carries exactly those truncated bytes.
  const big = buildTransmitPayload({
    approvedById: { a: "x".repeat(400), b: "y".repeat(400) },
    pieceOrder: ["a", "b"],
    transformedMessage: "",
    systemPrompt: "",
    history: [],
    maxChars: 600
  });
  assert.ok(big.contextText.endsWith("..."), "truncated contextText is marked");
  assert.ok(big.finalUserContent.includes(big.contextText), "transmitted content carries the truncated bytes shown in the modal");
  assert.ok(!big.finalUserContent.includes("y".repeat(400)), "cut tail never reaches the wire");
  console.log("ok - modal-visible bytes equal transmitted bytes");
}

// --- Truncation is visibly named by cut piece; never called "full" --------
console.log("truncation: named by cut piece, never described as full");
{
  const approvedById = {
    header: "PATIENT: Test",
    "admission:s1": "## History of Present Illness\n" + "x".repeat(400),
    "admission:s2": "## Plan\n" + "y".repeat(400)
  };
  const order = ["header", "admission:s1", "admission:s2"];
  const loc = locateTruncation(order, approvedById, 600);
  assert.ok(loc.truncated, "over-budget truncates");
  assert.equal(loc.cutPieceId, "admission:s2", "cut lands in the second large piece");
  // The offset points inside the cut piece, past the bytes already used.
  assert.ok(loc.cutOffsetInPiece > 0 && loc.cutOffsetInPiece < approvedById["admission:s2"].length, "offset lands inside the cut piece");
  // The user-facing truncation note names the cut piece by its title.
  const controllerSrc = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/ui/ai-chat/controller.js", import.meta.url), "utf8"));
  const noteLine = controllerSrc.split("\n").find((line) => line.includes("tail was cut inside"));
  assert.ok(noteLine, "truncation note template exists");
  assert.ok(noteLine.includes("cutPiece?.title"), "note names the cut piece by title");
  assert.ok(!/full chart|entire chart|complete chart/i.test(noteLine), "truncated chart is never described as full");
  console.log("ok - truncation is named by cut piece");
}

console.log("\nAll chart-grounded unit tests passed.");
