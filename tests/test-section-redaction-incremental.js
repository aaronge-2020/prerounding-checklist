import assert from "node:assert/strict";
import { planSectionRedaction, replaceSectionsFromFormAsync } from "../src/patient-context/sections.js";
import { createEphemeralRedactionReview } from "../src/patient-context/review.js";
import { redactionPosition } from "../src/ui/redaction/presentation.js";

// --- planSectionRedaction ---
assert.deepEqual(planSectionRedaction("Same text.", "Same text."), { mode: "unchanged" });
assert.deepEqual(planSectionRedaction("", ""), { mode: "unchanged" });
assert.deepEqual(
  planSectionRedaction("Admitted for chest pain.", "Admitted for chest pain. Troponin trending down."),
  { mode: "append", suffix: "Troponin trending down.", leadingWhitespace: " ", trailingWhitespace: "" },
  "boundary whitespace is carved out separately so it survives even though the de-id engine trims its input"
);
assert.deepEqual(
  planSectionRedaction("Admitted for chest pain.", "Admitted for chest pain.\n\nTroponin trending down.  "),
  { mode: "append", suffix: "Troponin trending down.", leadingWhitespace: "\n\n", trailingWhitespace: "  " }
);
assert.deepEqual(planSectionRedaction("Admitted for chest pain.", "Chest pain, admitted."), { mode: "full" });
assert.deepEqual(planSectionRedaction("", "New field text."), { mode: "full" }, "an empty prior field has nothing to append to, so it must be fully redacted");
assert.deepEqual(planSectionRedaction("Admitted for chest pain.", "Admitted for chest"), { mode: "full" }, "a shortened field is not an append and must fall back to full re-redaction");
assert.deepEqual(
  planSectionRedaction("Admitted for chest pain.", "Admitted for chest pain.   "),
  { mode: "append", suffix: "", leadingWhitespace: "   ", trailingWhitespace: "" },
  "appending only whitespace leaves nothing that needs de-identification"
);

// --- replaceSectionsFromFormAsync: unchanged sections are never reprocessed ---
{
  const calls = [];
  const deidentify = async (text) => {
    calls.push(text);
    return { text: `REDACTED(${text})`, residualWarnings: [] };
  };
  const rows = [{ id: "s1", label: "Admission context", text: "Stable prior text.", createdAt: "2026-01-01T00:00:00.000Z" }];
  const priorSections = [{ id: "s1", deidentifiedText: "Stable prior text.", residualWarnings: [{ severity: "review", type: "residual", reason: "flagged" }] }];
  const [section] = await replaceSectionsFromFormAsync(rows, deidentify, { priorSections });
  assert.deepEqual(calls, [], "an unchanged field must not be sent through de-identification again");
  assert.equal(section.deidentifiedText, "Stable prior text.");
  assert.deepEqual(section.residualWarnings, [{ severity: "review", type: "residual", reason: "flagged" }]);
}

// --- replaceSectionsFromFormAsync: appended text only redacts the new suffix ---
{
  const calls = [];
  const deidentify = async (text) => {
    calls.push(text);
    return { text: text.replace("John Smith", "[PATIENT NAME]"), residualWarnings: [{ severity: "review", type: "residual", reason: "new flag" }] };
  };
  const priorText = "Admitted for chest pain, troponin negative.";
  const rows = [{ id: "s1", label: "Admission context", text: `${priorText} Seen again by John Smith today.`, createdAt: "2026-01-01T00:00:00.000Z" }];
  const priorSections = [{ id: "s1", deidentifiedText: priorText, residualWarnings: [{ severity: "review", type: "residual", reason: "old flag" }] }];
  let observed = null;
  const [section] = await replaceSectionsFromFormAsync(rows, deidentify, {
    priorSections,
    onResult: (info) => { observed = info; }
  });
  assert.deepEqual(calls, ["Seen again by John Smith today."], "only the newly appended text (with its own leading whitespace carved out) should be sent through de-identification");
  assert.equal(section.deidentifiedText, `${priorText} Seen again by [PATIENT NAME] today.`, "the saved field is the untouched prior text plus the newly redacted suffix");
  assert.deepEqual(section.residualWarnings, [
    { severity: "review", type: "residual", reason: "old flag" },
    { severity: "review", type: "residual", reason: "new flag" }
  ], "residual warnings from the untouched prefix carry over alongside newly detected ones for the suffix");
  assert.equal(observed.plan.mode, "append");
  assert.equal(observed.plan.suffix, "Seen again by John Smith today.");
  assert.equal(observed.plan.leadingWhitespace, " ");
  assert.equal(observed.prior.deidentifiedText, priorText);
}

// --- replaceSectionsFromFormAsync: boundary whitespace survives even when the
// de-id call trims its input, exactly like the real local de-id engine does ---
{
  const deidentify = async (text) => ({ text: text.trim(), residualWarnings: [] });
  const priorText = "MRN: [MRN] Admitted for chest pain.";
  const rows = [{ id: "s1", label: "Admission context", text: `${priorText} Follow-up MRN: 555555 confirmed today.`, createdAt: "2026-01-01T00:00:00.000Z" }];
  const priorSections = [{ id: "s1", deidentifiedText: priorText, residualWarnings: [] }];
  const [section] = await replaceSectionsFromFormAsync(rows, deidentify, { priorSections });
  assert.equal(
    section.deidentifiedText,
    `${priorText} Follow-up MRN: 555555 confirmed today.`,
    "the space between the untouched prior text and the newly appended suffix must not be silently dropped when the de-id call trims its input"
  );
}

// --- replaceSectionsFromFormAsync: an in-place edit falls back to a full re-redaction ---
{
  const calls = [];
  const deidentify = async (text) => {
    calls.push(text);
    return { text: `REDACTED(${text})`, residualWarnings: [] };
  };
  const rows = [{ id: "s1", label: "Admission context", text: "Edited from the start.", createdAt: "2026-01-01T00:00:00.000Z" }];
  const priorSections = [{ id: "s1", deidentifiedText: "Original from the start.", residualWarnings: [] }];
  const [section] = await replaceSectionsFromFormAsync(rows, deidentify, { priorSections });
  assert.deepEqual(calls, ["Edited from the start."], "an edit that isn't a pure append must re-redact the whole field");
  assert.equal(section.deidentifiedText, "REDACTED(Edited from the start.)");
}

// --- createEphemeralRedactionReview: occurrence offset for suffix-only reviews ---
{
  const priorOutputText = "Admitted [PATIENT NAME] yesterday for evaluation.";
  const suffixRawText = "Discussed history with Jane Roe again.";
  const suffixResult = {
    text: "Discussed history with [PATIENT NAME] again.",
    entities: [{ start: 24, end: 32, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "local de-identification" }]
  };
  const review = createEphemeralRedactionReview(suffixRawText, suffixResult, { priorOutputText });
  assert.equal(review.redactions.length, 1);
  assert.equal(review.redactions[0].occurrence, 1, "the suffix's redaction is the second occurrence of this placeholder once appended after the already-committed prefix");

  const fullText = priorOutputText + suffixResult.text;
  const position = redactionPosition(fullText, review.redactions[0]);
  assert.equal(position, priorOutputText.length + suffixResult.text.indexOf("[PATIENT NAME]"), "occurrence-aware lookup must resolve to the suffix's placeholder, not the prefix's earlier one");
}

// --- createEphemeralRedactionReview: no prior text behaves exactly as before (occurrence offset 0) ---
{
  const result = {
    text: "[PATIENT NAME] and [PATIENT NAME] again.",
    entities: [
      { start: 0, end: 4, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "local de-identification" },
      { start: 9, end: 13, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "local de-identification" }
    ]
  };
  const review = createEphemeralRedactionReview("Jane and Jane again.", result);
  assert.equal(review.redactions[0].occurrence, 0);
  assert.equal(review.redactions[1].occurrence, 1);
}

console.log("Incremental section-redaction tests passed");
