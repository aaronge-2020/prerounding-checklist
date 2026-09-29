/**
 * Regression test for the source-kind picker bug.
 *
 * Bug: Clicking a source-kind button (e.g. "Vital signs") in the source-kind
 * picker updated the button's selected state but did NOT re-render the editor
 * below. The editor kept showing the previous source kind's UI (e.g. the
 * primary-note "Enter by section" interface) even though "Vital signs" appeared
 * selected.
 *
 * Fix: selectSourceKind() now re-renders the editor container via the extracted
 * renderSourceKindEditor() presentation function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("selectSourceKind re-renders the editor container", () => {
  const controllerSrc = readFileSync(join(repoRoot, "src/ui/daily/source-controller.js"), "utf8");

  // The fix: selectSourceKind must update the editor DOM, not just button states
  assert.match(
    controllerSrc,
    /function selectSourceKind[\s\S]*?data-source-kind-editor/,
    "selectSourceKind should target the [data-source-kind-editor] container"
  );
  assert.match(
    controllerSrc,
    /function selectSourceKind[\s\S]*?renderSourceKindEditor/,
    "selectSourceKind should call renderSourceKindEditor to swap the editor UI"
  );
});

test("renderSourceKindEditor is extracted and exported", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/daily/presentation.js"), "utf8");

  assert.match(
    presentationSrc,
    /function renderSourceKindEditor\(/,
    "renderSourceKindEditor should be defined"
  );
  assert.match(
    presentationSrc,
    /renderSourceKindEditor,\n\s*renderSourceParsePreview/,
    "renderSourceKindEditor should be exported from the presentation factory"
  );
});

test("renderSourceWorkspace uses the editor container", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/daily/presentation.js"), "utf8");

  assert.match(
    presentationSrc,
    /data-source-kind-editor="\$\{scope\}"/,
    "renderSourceWorkspace should wrap the editor in [data-source-kind-editor]"
  );
  // The old inline ternary should be gone — replaced by the container + function call
  assert.doesNotMatch(
    presentationSrc,
    /\$\{selectedSourceKind === "primary_note" \? renderStructuredPrimaryNote/,
    "The old inline editor ternary should be replaced by renderSourceKindEditor"
  );
});

test("renderSourceKindEditor handles both primary_note and generic sources", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/daily/presentation.js"), "utf8");

  // Extract the function body
  const funcStart = presentationSrc.indexOf("function renderSourceKindEditor({");
  assert.ok(funcStart !== -1, "Function should exist");
  const funcBody = presentationSrc.slice(funcStart, funcStart + 3000);

  assert.match(funcBody, /selectedSourceKind === "primary_note"/, "Should branch on primary_note");
  assert.match(funcBody, /renderStructuredPrimaryNote/, "Should render structured note for primary_note");
  assert.match(funcBody, /source-capture-composer/, "Should render generic composer for other kinds");
});
