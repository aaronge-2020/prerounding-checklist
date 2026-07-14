import assert from "node:assert/strict";
import { buildPromptPreviewSegments, tokenAccentColor } from "../src/prompts/custom-templates.js";

// Same token -> same color everywhere (menu swatch and highlighted output
// must visually agree), and it must not depend on call order/position.
{
  const first = tokenAccentColor("@admission-packet");
  const second = tokenAccentColor("@admission-packet");
  assert.equal(first, second);
  assert.notEqual(first, tokenAccentColor("@selected-day"));
  assert.notEqual(tokenAccentColor("@admission-packet"), tokenAccentColor("@admission-packet", { dot: true }));
}

// Literal text around a variable stays literal; the variable becomes its own segment.
{
  const segments = buildPromptPreviewSegments("Hello @name, welcome.", { "@name": "Jordan" });
  assert.deepEqual(segments, [
    { type: "text", value: "Hello " },
    { type: "token", token: "@name", value: "Jordan" },
    { type: "text", value: ", welcome." }
  ]);
}

// Longer token wins over a shorter one that is a prefix of it, so
// "@admission-context-2" is never half-matched by "@admission-context".
{
  const segments = buildPromptPreviewSegments("Use @admission-context-2 only.", {
    "@admission-context": "short value",
    "@admission-context-2": "long value"
  });
  const tokenSegment = segments.find((segment) => segment.type === "token");
  assert.equal(tokenSegment.token, "@admission-context-2");
  assert.equal(tokenSegment.value, "long value");
}

// No recognized tokens in the variable map -> the whole template is one text segment.
{
  const segments = buildPromptPreviewSegments("Plain text with @nothing-registered.", {});
  assert.deepEqual(segments, [{ type: "text", value: "Plain text with @nothing-registered." }]);
}

console.log("Prompt preview segment/color tests passed");
