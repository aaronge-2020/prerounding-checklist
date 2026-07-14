import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
const appLineCount = appSource.split(/\r?\n/).length;

// This ceiling is intentionally below the pre-refactor coordinator size. New
// feature behavior belongs in a scoped module, not another app.js template.
assert.ok(appLineCount <= 3700, `src/ui/app.js is ${appLineCount} lines; extract the feature before adding more coordinator code.`);

for (const legacyTemplate of [
  "renderChecklistSection",
  "renderWorkupRow",
  "renderWorkupColumn",
  "renderWorkupItemEditor",
  "renderSectionReview"
]) {
  assert.doesNotMatch(appSource, new RegExp(`function ${legacyTemplate}\\(`), `${legacyTemplate} belongs in its feature presentation module.`);
}

for (const path of [
  "../src/ui/checklist/presentation.js",
  "../src/ui/redaction/presentation.js",
  "../src/ui/workups/presentation.js",
  "../src/ui/prompts/presentation.js",
  "../src/ui/settings/presentation.js",
  "../src/ui/settings/guidelines-presentation.js"
]) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:document|window|navigator)\s*\.\s*(?:querySelector|querySelectorAll|getElementById|createElement|addEventListener|location|clipboard|open)/, `${path} must remain a pure presentation module.`);
}

console.log("UI module boundary checks passed");
