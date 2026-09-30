/**
 * Regression test: saving a chart source / result WITHOUT de-identification.
 *
 * Aaron's report: the de-identification model sometimes produces continuous
 * false positives, and there was no way to save the source as-is so he could
 * correct them manually. The composer now has a secondary "Save without
 * de-identifying" action next to "De-identify and add source".
 *
 * The bypass must:
 *  - skip the de-id model entirely (no download, no ensureSelectedDeidReady),
 *  - store the text verbatim with deidentificationSkipped: true,
 *  - show a persistent "Not de-identified" warning on the saved section,
 *  - still clear the composer and persist the encrypted vault.
 *
 * All fixtures are synthetic and PHI-free. No browser needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Part 1: wiring guards (read the sources as text)
// ---------------------------------------------------------------------------

test("composer renders a save-without-de-identifying button for both scopes", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/daily/presentation.js"), "utf8");
  assert.match(
    presentationSrc,
    /data-action="\$\{addAction\}-raw"/,
    "the generic source composer must render a secondary ${addAction}-raw button"
  );
  assert.match(
    presentationSrc,
    /Save without de-identifying/,
    "the secondary button must be labeled 'Save without de-identifying'"
  );
});

test("app.js routes the raw actions to the controller with deidentify:false", () => {
  const appSrc = readFileSync(join(repoRoot, "src/ui/app.js"), "utf8");
  assert.match(
    appSrc,
    /action === "add-daily-source-raw".*addSource\(\{\s*deidentify:\s*false\s*\}\)/,
    "add-daily-source-raw must call dailySourceController.addSource({ deidentify: false })"
  );
  assert.match(
    appSrc,
    /action === "add-admission-source-raw".*addAdmissionSource\(\{\s*deidentify:\s*false\s*\}\)/,
    "add-admission-source-raw must call dailySourceController.addAdmissionSource({ deidentify: false })"
  );
});

test("source controller skips the de-id model when deidentify is false", () => {
  const controllerSrc = readFileSync(join(repoRoot, "src/ui/daily/source-controller.js"), "utf8");
  assert.match(
    controllerSrc,
    /async function addSource\(\{\s*deidentify\s*=\s*true\s*\}\s*=\s*\{\}\)/,
    "addSource must accept a { deidentify } option defaulting to true"
  );
  assert.match(
    controllerSrc,
    /async function addAdmissionSource\(\{\s*deidentify\s*=\s*true\s*\}\s*=\s*\{\}\)/,
    "addAdmissionSource must accept a { deidentify } option defaulting to true"
  );
  // The ensureSelectedDeidReady call must live inside the `if (deidentify)` branch,
  // never on the bypass path.
  const addSourceBody = controllerSrc.slice(
    controllerSrc.indexOf("async function addSource("),
    controllerSrc.indexOf("async function addAdmissionSource(")
  );
  assert.match(
    addSourceBody,
    /if\s*\(deidentify\)\s*\{[\s\S]*?ensureSelectedDeidReady/,
    "ensureSelectedDeidReady must only run inside the deidentify branch of addSource"
  );
  assert.match(
    addSourceBody,
    /deidentificationSkipped:\s*!deidentify/,
    "captures must record deidentificationSkipped: !deidentify"
  );
});

test("saved sections carry a visible not-de-identified warning", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/redaction/presentation.js"), "utf8");
  assert.match(
    presentationSrc,
    /section\.deidentificationSkipped/,
    "renderSectionSurface must branch on section.deidentificationSkipped"
  );
  assert.match(
    presentationSrc,
    /Not de-identified/,
    "the skipped section must show a 'Not de-identified' warning"
  );
});

// ---------------------------------------------------------------------------
// Part 2: data constructors keep the flag and the text verbatim
// ---------------------------------------------------------------------------

const { createSourceCapture, normalizeSourceCapture } = await import(
  "../src/patient-context/source-captures.js"
);
const { createTextSection } = await import("../src/app/state/vault.js");

test("createSourceCapture stores raw text verbatim with the skipped flag", () => {
  const raw = "Pt Aaron Testman c/o chest pain, DOB 01/02/1990.";
  const capture = createSourceCapture({
    sourceKind: "progress_note",
    label: "Note",
    text: raw,
    deidentificationSkipped: true
  });
  assert.equal(capture.deidentifiedText, raw, "bypassed text must be stored verbatim");
  assert.equal(capture.deidentificationSkipped, true);
});

test("normalizeSourceCapture preserves the skipped flag and defaults it to false", () => {
  const skipped = normalizeSourceCapture(
    createSourceCapture({ sourceKind: "progress_note", label: "N", text: "x", deidentificationSkipped: true })
  );
  assert.equal(skipped.deidentificationSkipped, true, "the flag must survive normalization");
  const legacy = normalizeSourceCapture({ id: "old", sourceKind: "progress_note", label: "N", text: "x" });
  assert.equal(legacy.deidentificationSkipped, false, "older records without the flag default to false");
});

test("createTextSection stores raw text verbatim with the skipped flag", () => {
  const raw = "Raw admission source with a false-positive name: Aaron Testman.";
  const section = createTextSection("Admission note", {
    scope: "context",
    text: raw,
    deidentificationSkipped: true
  });
  assert.equal(section.deidentifiedText, raw, "bypassed text must be stored verbatim");
  assert.equal(section.deidentificationSkipped, true);
  const normal = createTextSection("Admission note", { scope: "context", text: raw });
  assert.equal(normal.deidentificationSkipped, false, "default path must not set the flag");
});
