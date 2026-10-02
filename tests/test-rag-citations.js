// Tests for src/rag/citations.js: [Cn] parsing and chip rendering.

import assert from "node:assert/strict";

import {
  citedNumbers,
  parseCitationTags,
  renderCitedHtml
} from "../src/rag/citations.js";

const escapeHtml = (s) => String(s)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

{
  const tags = parseCitationTags("Pain started [C1] and labs show [C2]. Also [C1] again.");
  assert.deepEqual(tags.map((t) => t.n), [1, 2, 1], "finds all tags in order");
  assert.deepEqual(parseCitationTags("no citations here"), [], "empty when none");
  assert.deepEqual(parseCitationTags("[C] [c1] [C01]"), [{ n: 1, start: 9, end: 14 }],
    "only strict [Cn] uppercase-digit tags match ([C01] parses as 1)");
  assert.equal(parseCitationTags("[C12]")[0].n, 12, "multi-digit numbers");
}

{
  assert.deepEqual(citedNumbers("A [C2] then [C1] then [C2]"), [2, 1], "distinct in first-appearance order");
  assert.deepEqual(citedNumbers("plain text"), []);
}

{
  const chunksByN = new Map([
    [1, { label: "History of present illness", group: "Admission" }],
    [2, { label: "Progress note", group: "Hospital day 1" }]
  ]);
  const html = renderCitedHtml("Pain began 2 hours ago [C1] and troponin rose [C2].", chunksByN, escapeHtml);
  assert.ok(html.includes('data-rag-cite="1"'), "C1 renders as a chip");
  assert.ok(html.includes('data-rag-cite="2"'), "C2 renders as a chip");
  assert.ok(html.includes("Admission — History of present illness"), "chip tooltip names the section");
  assert.ok(html.includes("Hospital day 1 — Progress note"), "chip tooltip names the day section");
  assert.ok(html.includes("Pain began 2 hours ago"), "surrounding text preserved");
}

{
  // Hallucinated/out-of-range citations render as inert text, never chips.
  const chunksByN = new Map([[1, { label: "HPI", group: "Admission" }]]);
  const html = renderCitedHtml("The patient improved [C1] and was cured [C99].", chunksByN, escapeHtml);
  assert.ok(html.includes('data-rag-cite="1"'), "known citation is a chip");
  assert.ok(!html.includes('data-rag-cite="99"'), "unknown citation is NOT a chip");
  assert.ok(html.includes("[C99]"), "unknown citation text still shown");
}

{
  // Works with a plain object map too.
  const html = renderCitedHtml("Note [C3].", { 3: { label: "Plan", group: "" } }, escapeHtml);
  assert.ok(html.includes('data-rag-cite="3"'), "object map lookup works");
}

{
  // Raw HTML in the model text is escaped; chips stay intact.
  const html = renderCitedHtml("<script>alert(1)</script> [C1]", new Map([[1, { label: "L", group: "G" }]]), escapeHtml);
  assert.ok(!html.includes("<script>"), "model HTML is escaped");
  assert.ok(html.includes("&lt;script&gt;"), "escaped content visible");
  assert.ok(html.includes('data-rag-cite="1"'), "chip still rendered");

  // No tags -> fully escaped plain text.
  assert.equal(renderCitedHtml("<b>hi</b>", new Map(), escapeHtml), "&lt;b&gt;hi&lt;/b&gt;");
}

console.log("test-rag-citations: all assertions passed");
