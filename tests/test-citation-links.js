// Tests for clickable AI Chat citations (fixtures are synthetic, PHI-free):
//   src/ui/openai-client.js  -> extractSources (url_citation annotations)
//   src/ai/citation-links.js  -> matchCitationToSource, linkifyCitations,
//                                buildSourcesSection, withClickableCitations
// plus the end-to-end render through renderChatMarkdown.
import assert from "node:assert/strict";
import { extractSources } from "../src/ui/openai-client.js";
import {
  buildSourcesSection,
  linkifyCitations,
  matchCitationToSource,
  withClickableCitations,
} from "../src/ai/citation-links.js";
import { renderChatMarkdown } from "../src/local-llm/markdown.js";
import { sentinelizeSectionCitations } from "../src/ui/ai-chat/section-citations.js";

const SOURCES = [
  {
    url: "https://www.acog.org/clinical/clinical-guidance/practice-bulletin/articles/2021/06/postpartum-hemorrhage",
    title: "ACOG Practice Bulletin No. 233: Postpartum Hemorrhage",
  },
  {
    url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001183",
    title: "2023 AHA/ACC Guideline for the Management of Heart Failure",
  },
];

// --- extractSources -------------------------------------------------------
{
  const payload = {
    output: [
      { type: "web_search_call", status: "completed" },
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Oxytocin is first-line.",
            annotations: [
              { type: "url_citation", url: "https://www.acog.org/a", title: "ACOG PB 233", start_index: 0, end_index: 8 },
              { type: "url_citation", url: "https://www.acog.org/a", title: "dup", start_index: 0, end_index: 4 },
              { type: "url_citation", url: "ftp://files.example/b", title: "non-http skipped" },
              { type: "commentary", url: "https://example.com/c", title: "wrong type skipped" },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(extractSources(payload), [
    { url: "https://www.acog.org/a", title: "ACOG PB 233" },
  ], "dedupes by url, keeps http(s), skips other annotation types");
  assert.deepEqual(extractSources({}), [], "empty payload");
  assert.deepEqual(extractSources(null), [], "null payload");
  assert.deepEqual(extractSources({ output: [{ type: "message", content: [] }] }), [], "no annotations");
}

// --- matchCitationToSource -------------------------------------------------
{
  const hit = matchCitationToSource("ACOG Practice Bulletin No. 233", SOURCES);
  assert.equal(hit?.url, SOURCES[0].url, "matches on title tokens");
  const orgHit = matchCitationToSource("ACOG", SOURCES);
  assert.equal(orgHit?.url, SOURCES[0].url, "short org label matches via url token");
  assert.equal(matchCitationToSource("Williams Obstetrics, 26th ed.", SOURCES), null, "no match -> null");
  assert.equal(matchCitationToSource("anything", []), null, "empty sources -> null");
}

// --- linkifyCitations -------------------------------------------------------
{
  const out = linkifyCitations(
    "Give oxytocin [ACOG Practice Bulletin No. 233]. See [Williams Obstetrics, 26th ed.].",
    SOURCES
  );
  assert.ok(out.includes(`[ACOG Practice Bulletin No. 233](${SOURCES[0].url})`), "matched citation links to the source url");
  assert.ok(
    out.includes("[Williams Obstetrics, 26th ed.](https://www.google.com/search?q=%22Williams%20Obstetrics%2C%2026th%20ed.%22)"),
    "unmatched citation links to an exact-phrase search, never an invented url"
  );
}

{
  // Non-citations stay plain text.
  const out = linkifyCitations("On [Hospital Day 3] vitals stable [DATE] note [1] [10].", SOURCES);
  assert.ok(!out.includes("<a"), "no anchors produced by the linkifier itself");
  assert.ok(!out.includes("google.com/search"), "placeholders and bare numbers are not linkified");
  assert.ok(out.includes("[Hospital Day 3]") && out.includes("[1]"), "original text preserved");
}

{
  // Existing markdown links are untouched.
  const out = linkifyCitations("See [the source](https://example.com/x) for detail.", SOURCES);
  assert.equal(out, "See [the source](https://example.com/x) for detail.", "markdown links pass through");
}

// --- buildSourcesSection ----------------------------------------------------
{
  assert.equal(buildSourcesSection([]), "", "no sources -> no section");
  const section = buildSourcesSection([...SOURCES, SOURCES[0]]);
  assert.ok(section.includes("**Sources**"), "section header");
  assert.ok(section.includes(`1. [ACOG Practice Bulletin No. 233: Postpartum Hemorrhage](${SOURCES[0].url})`), "first source numbered");
  assert.ok(section.includes(`2. [2023 AHA/ACC Guideline for the Management of Heart Failure](${SOURCES[1].url})`), "second source numbered");
  assert.ok(!section.includes("3."), "deduplicated");
}

// --- withClickableCitations ---------------------------------------------------
{
  assert.equal(
    withClickableCitations("Error: the request failed", SOURCES),
    "Error: the request failed",
    "error replies pass through untouched"
  );
  const out = withClickableCitations("Start GDMT [2023 AHA/ACC Guideline for the Management of Heart Failure].", SOURCES);
  assert.ok(out.includes(SOURCES[1].url), "citation linked");
  assert.ok(out.includes("**Sources**"), "sources section appended");
}

// --- end to end: every citation renders as a clickable anchor ---------------
{
  const html = renderChatMarkdown(withClickableCitations(
    "Give oxytocin [ACOG Practice Bulletin No. 233] and see [Williams Obstetrics, 26th ed.].",
    SOURCES
  ));
  const anchors = html.match(/<a href=/g) || [];
  assert.ok(anchors.length >= 3, `every citation plus sources are anchors (found ${anchors.length})`);
  assert.ok(html.includes(`href="${SOURCES[0].url}"`), "real source url in an anchor");
  assert.ok(html.includes('target="_blank"'), "anchors open in a new tab");
  // The visible citation text is unchanged — only now clickable.
  assert.ok(html.includes(">ACOG Practice Bulletin No. 233</a>"), "citation label preserved as link text");
}


// --- composition with the section-citation renderer -------------------------
{
  // `per [Section]` chart citations are owned by the section-citation
  // renderer (sentinelized before linkify runs); linkify must not touch them.
  const out = linkifyCitations("Note per [History of Present Illness]: 'chest pain'.", SOURCES);
  assert.ok(!out.includes("google.com/search"), "per [Section] left alone even on raw text");
  assert.ok(out.includes("per [History of Present Illness]:"), "section marker text preserved");
}

{
  // The presentation order: sentinelize first, then linkify. The sentinel
  // carries no brackets, so linkify skips it; guideline citations still link.
  const raw = "Note per [History of Present Illness]: 'chest pain' [ACOG PB 233].";
  const { text: sentinelized, cites } = sentinelizeSectionCitations(raw);
  assert.equal(cites.length, 1, "section citation parsed");
  const out = linkifyCitations(sentinelized, SOURCES);
  assert.ok(!out.includes("google.com/search?q=%22History"), "section label not search-linked");
  assert.ok(out.includes(`[ACOG PB 233](${SOURCES[0].url})`), "guideline citation still linkified");
  assert.ok(out.includes("\uE000SECITE0\uE001"), "sentinel survives linkify for the chip swap");
}

console.log("citation link tests passed");
