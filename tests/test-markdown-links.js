// Tests for safe clickable citations in src/local-llm/markdown.js
// (renderChatMarkdown). Fixtures are synthetic and PHI-free.
import assert from "node:assert/strict";
import { renderChatMarkdown } from "../src/local-llm/markdown.js";

{
  // The exact citation shapes the model emits become real links that open
  // in a new tab, with the query string intact.
  const html = renderChatMarkdown(
    "See [ahajournals.org](https://www.ahajournals.org/doi/10.1161/STR.0000000000000513?utm_source=openai)."
  );
  assert.ok(html.includes('target="_blank"'), "link opens in a new tab");
  assert.ok(html.includes('rel="noopener noreferrer"'), "link is rel-hardened");
  assert.ok(html.includes("https://www.ahajournals.org/doi/10.1161/STR.0000000000000513?utm_source=openai"), "query string intact");
  assert.ok(html.includes(">ahajournals.org</a>"), "label preserved");
}

{
  const html = renderChatMarkdown(
    "[aabb.org](https://www.aabb.org/docs/default-source/default-document-library/resources/updates-in-red-blood-cell-transfusion-thresholds.pdf?utm_source=openai)"
  );
  assert.ok(html.includes("<a "), "pdf citation is a link");
  assert.ok(html.includes("updates-in-red-blood-cell-transfusion-thresholds.pdf?utm_source=openai"), "pdf url intact");
}

{
  // Unsafe schemes stay inert text — never become links.
  for (const url of ["javascript:alert(1)", "data:text/html,<h1>x</h1>", "JaVaScRiPt:alert(1)"]) {
    const html = renderChatMarkdown(`[click](${url})`);
    assert.ok(!html.includes("<a "), `no link for ${url.split(":")[0]} scheme`);
    assert.ok(!html.includes("alert(1)</a>"), "no executable anchor");
  }
}

{
  // Link text is HTML-escaped before the anchor is built.
  const html = renderChatMarkdown('[a"b](https://example.com/?x=1&y=2)');
  assert.ok(!html.includes('a"b'), "quote in label escaped");
  assert.ok(html.includes("https://example.com/?x=1&amp;y=2"), "ampersand in url escaped");
}

{
  // Links survive the bold/italic passes and coexist with formatting.
  const html = renderChatMarkdown("**Important:** see [src](https://example.com/a) and *note*.");
  assert.ok(html.includes("<strong>Important:</strong>"), "bold still renders");
  assert.ok(html.includes("<em>note</em>"), "italic still renders");
  assert.ok(html.includes('<a href="https://example.com/a"'), "link intact beside formatting");
}

{
  // Plain text and code spans are unaffected.
  const html = renderChatMarkdown("Use `dose * weight` carefully.");
  assert.ok(html.includes("<code>dose * weight</code>"), "code span renders");
  assert.ok(!html.includes("<a "), "no phantom links");
}

console.log("markdown link tests passed");
