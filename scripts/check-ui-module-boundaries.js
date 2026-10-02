import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
const appLineCount = appSource.split(/\r?\n/).length;

// This ceiling is intentionally below the pre-refactor coordinator size. New
// feature behavior belongs in a scoped module, not another app.js template.
assert.ok(appLineCount <= 4250, `src/ui/app.js is ${appLineCount} lines; extract the feature before adding more coordinator code.`);

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
  "../src/ui/cheat-sheets/presentation.js",
  "../src/ui/redaction/presentation.js",
  "../src/ui/review/presentation.js",
  "../src/ui/prompts/presentation.js",
  "../src/ui/demo/presentation.js",
  "../src/ui/demo/session.js",
  "../src/ui/settings/presentation.js",
  "../src/ui/settings/guidelines-presentation.js",
  "../src/ui/scores/presentation.js"
]) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:document|window|navigator)\s*\.\s*(?:querySelector|querySelectorAll|getElementById|createElement|addEventListener|location|clipboard|open)/, `${path} must remain a pure presentation module.`);
}

console.log("UI module boundary checks passed");

// Patient-boundary invariant: the in-memory draft/review session maps
// (noteDraftSessions, structuredNoteDrafts, ...) are keyed by packet, not by
// patient. Every function that installs a new active patient must clear the
// patient-scoped session first, or the new patient's draft note renders the
// previous patient's content (admitPatient missed this on 2026-09-29).
function extractFunctionBody(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "g");
  const match = pattern.exec(source);
  assert.ok(match, `expected function ${name}() in src/ui/app.js`);
  let depth = 0;
  for (let i = match.index + match[0].length - 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(match.index, i + 1);
    }
  }
  assert.fail(`could not extract body of ${name}()`);
}
for (const boundary of ["selectPatient", "admitPatient", "archiveSelectedPatient", "clearSensitiveSession"]) {
  const body = extractFunctionBody(appSource, boundary);
  assert.ok(
    body.includes("clearPatientScopedSession("),
    `${boundary}() installs a new active patient and must call clearPatientScopedSession() first`
  );
}
// Generic sweep: any other function that installs the active patient must
// clear too (updateOrInitializeVault is the one helper whose caller clears).
for (const match of appSource.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
  const name = match[1];
  if (name === "updateOrInitializeVault") continue;
  const body = extractFunctionBody(appSource, name);
  if (body.includes("setActivePatient(")) {
    assert.ok(
      body.includes("clearPatientScopedSession("),
      `${name}() calls setActivePatient() and must call clearPatientScopedSession() first`
    );
  }
}

console.log("Patient-boundary session-clear checks passed");
