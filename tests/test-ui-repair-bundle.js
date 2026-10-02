// Regression tests for the prerounding UI repair bundle (2026-09-29):
//   1. Drug Lookup manual additions survive re-renders (were wiped by
//      ensureAutoLoaded's inverted "__manual__" sentinel).
//   2. Cheat Sheets search layout (CSS/HTML selector mismatch → giant icon).
//   3. Sidebar grouped into sections; phone Scribe removed from nav.
//   4. AI Chat per-day-group Select all / Deselect all controls.
//   5. Review-modal whitespace (pre-wrap on container → blank gaps).
//   6. AI Chat ?v= cache-chain coordination (stale v8 bypassed the
//      unchanged-context review-skip logic).
//
// All fixtures are synthetic and PHI-free.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// 1. Drug Lookup: manual additions survive ensureAutoLoaded
// ---------------------------------------------------------------------------
const { createDrugLookupController } = await import("../src/ui/drug-lookup/controller.js");
const { createDrugLookupPresentation } = await import("../src/ui/drug-lookup/presentation.js");

{
  let mar = ["lisinopril", "metformin"];
  const presentation = createDrugLookupPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => ""
  });
  const ctrl = createDrugLookupController({
    presentation,
    render: () => {},
    setStatus: () => {},
    getPatientMedicationNames: () => mar,
    getActivePatientLabel: () => "Test Patient",
    fetchImpl: () => { throw new Error("no network in test"); }
  });

  // MAR auto-loads on first render.
  ctrl.ensureAutoLoaded();
  assert.deepEqual(
    ctrl.getState().drugs.map((d) => d.input),
    ["lisinopril", "metformin"],
    "MAR auto-loads on first ensureAutoLoaded"
  );

  // Manual add via the Add button.
  globalThis.document = { querySelector: () => ({ value: "aspirin" }) };
  const addTarget = { dataset: { action: "drug-lookup-add" }, closest: (s) => (s === "[data-action]" ? addTarget : null) };
  assert.equal(ctrl.click(addTarget), true, "add action handled");
  delete globalThis.document;
  assert.ok(
    ctrl.getState().drugs.some((d) => d.input === "aspirin"),
    "manual addition lands in the drug list"
  );

  // THE BUG: a re-render (ensureAutoLoaded) used to wipe the manual add
  // because the "__manual__" sentinel never matched the MAR key.
  ctrl.ensureAutoLoaded();
  assert.ok(
    ctrl.getState().drugs.some((d) => d.input === "aspirin"),
    "manual addition survives ensureAutoLoaded on re-render"
  );
  assert.equal(ctrl.getState().drugs.length, 3, "MAR drugs + manual add all present");

  // A genuine MAR change still reloads.
  mar = ["lisinopril", "metformin", "atorvastatin"];
  ctrl.ensureAutoLoaded();
  assert.deepEqual(
    ctrl.getState().drugs.map((d) => d.input),
    ["lisinopril", "metformin", "atorvastatin"],
    "real MAR change triggers reload"
  );

  // "Check interactions" runs against the current list without resetting it.
  const html = presentation.renderDrugLookup(ctrl.getState());
  assert.ok(html.includes('data-action="drug-lookup-check"'), "Check interactions button rendered");
  const checkTarget = { dataset: { action: "drug-lookup-check" }, closest: (s) => (s === "[data-action]" ? checkTarget : null) };
  assert.equal(ctrl.click(checkTarget), true, "check action handled");
  assert.deepEqual(
    ctrl.getState().drugs.map((d) => d.input),
    ["lisinopril", "metformin", "atorvastatin"],
    "check does not reset the list to the MAR"
  );

  console.log("ok - drug lookup manual additions survive re-renders");
}

// ---------------------------------------------------------------------------
// 2. Cheat Sheets search layout
// ---------------------------------------------------------------------------
{
  const css = read("styles.css");
  const searchbar = css.match(/\.cs-searchbar\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(searchbar.includes("display: flex"), ".cs-searchbar is the flex wrapper");
  assert.ok(searchbar.includes("position: sticky"), ".cs-searchbar keeps sticky positioning");
  const icon = css.match(/\.cs-search-icon\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(/width:\s*18px/.test(icon) && /height:\s*18px/.test(icon), ".cs-search-icon has bounded dimensions");
  assert.ok(css.includes(".cs-search-icon svg"), "SVG inside the icon is constrained");
  const input = css.match(/\.cs-search\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(input.includes("flex: 1"), ".cs-search input fills the wrapper");
  assert.ok(!css.includes(".cs-search input {"), "dead .cs-search input selector is gone");
  console.log("ok - cheat sheets search layout");
}

// ---------------------------------------------------------------------------
// 3. Sidebar grouping + phone Scribe removal
// ---------------------------------------------------------------------------
{
  const html = read("index.html");
  const nav = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(nav.length > 0, "primary nav found");
  const groups = [...nav.matchAll(/<p class="nav-group-label"[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(groups, ["Patient", "AI", "Tools", "App"], "nav has the four expected groups");
  assert.ok(!nav.includes('data-action="open-scribe"'), "phone-first Scribe is not in the sidebar");
  assert.ok(nav.includes('data-view-target="scribePro"'), "Scribe Pro stays in the sidebar as a first-class view");
  for (const target of ["vault", "daily", "review", "aiChat", "prompts", "quickDeid", "cheatSheets", "drugLookup", "scores", "scribePro", "settings"]) {
    assert.ok(nav.includes(`data-view-target="${target}"`), `nav keeps ${target}`);
  }
  const css = read("styles.css");
  assert.ok(css.includes(".nav-group-label"), "group label styles exist");
  console.log("ok - sidebar grouping");
}

// ---------------------------------------------------------------------------
// 4. AI Chat per-group Select all / Deselect all
// ---------------------------------------------------------------------------
const { createAiChatPresentation } = await import("../src/ui/ai-chat/presentation.js");
{
  const presentation = createAiChatPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => ""
  });
  const vm = {
    mode: "local",
    hardware: { recommendation: { models: [], recommendedKey: null } },
    settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: true },
    llmStatus: { status: "ready", verified: true, activeModelKey: "" },
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false },
    downloaded: {},
    patientContext: { enabled: true, available: true, label: "Test", hasPatient: true, selectedCount: 2, pieceCount: 3 },
    contextInspector: {
      open: true,
      enabled: true,
      hasPatient: true,
      patientLabel: "Test",
      pieces: [
        { id: "a1", group: "Admission", label: "H&P", primary: true, tokens: 500, selected: true },
        { id: "h1", group: "HD 1", label: "Progress note", primary: false, tokens: 300, selected: true },
        { id: "h2", group: "HD 1", label: "Labs", primary: false, tokens: 200, selected: false }
      ],
      groups: ["Admission", "HD 1"],
      guidelinesTokens: 0,
      historyTokens: 0,
      historyCount: 0,
      selectedTokens: 800,
      contextWindow: 4096
    },
    remote: { messages: [], sending: false, webSearch: false, review: null },
    hasApiKey: false
  };
  const out = presentation.render(vm);
  // Every group gets Select all + Deselect all with a stable group index.
  assert.ok(out.includes('data-action="ai-chat-context-group"'), "group toggle buttons rendered");
  assert.ok(out.includes('data-group-index="0" data-select="1"'), "Admission Select all targets group 0");
  assert.ok(out.includes('data-group-index="1" data-select="0"'), "HD 1 Deselect all targets group 1");
  const selectAllCount = (out.match(/data-select="1"/g) || []).length;
  const deselectAllCount = (out.match(/data-select="0"/g) || []).length;
  assert.equal(selectAllCount, 2, "one Select all per group");
  assert.equal(deselectAllCount, 2, "one Deselect all per group");
  console.log("ok - ai chat per-group select/deselect controls");
}

// ---------------------------------------------------------------------------
// 5. Review-modal whitespace
// ---------------------------------------------------------------------------
{
  const css = read("styles.css");
  const body = css.match(/\.aic-hipaa-piece-body\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(!/white-space:\s*pre-wrap/.test(body), ".aic-hipaa-piece-body no longer uses pre-wrap");
  const preview = css.match(/\.aic-hipaa-preview\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(/white-space:\s*pre-wrap/.test(preview), ".aic-hipaa-preview keeps pre-wrap for real text");
  assert.ok(css.includes(".aic-hipaa-piece {") || css.includes(".aic-hipaa-piece{"), "piece card rule present");
  console.log("ok - review modal whitespace");
}

// ---------------------------------------------------------------------------
// 6. AI Chat ?v= cache-chain coordination
// ---------------------------------------------------------------------------
{
  const indexHtml = read("index.html");
  const appJs = read("src/ui/app.js");
  const controllerJs = read("src/ui/ai-chat/controller.js");
  assert.ok(indexHtml.includes("aichat=v17"), "index.html carries aichat=v17");
  assert.ok(!indexHtml.includes("aichat=v16"), "no stale aichat=v16 in index.html");
  assert.ok(appJs.includes("ai-chat/controller.js?v=20261001-ai-chat-drawer-sync"), "app.js imports controller drawer-sync");
  assert.ok(!appJs.includes("ai-chat-v8"), "no stale v8 in app.js");
  assert.ok(controllerJs.includes("presentation.js?v=20261001-ai-chat-fix-v1"), "controller imports presentation fix-v1");
  assert.ok(!controllerJs.includes("ai-chat-v8"), "no stale v8 in controller");
  console.log("ok - ai chat cache chain");
}

console.log("\nAll UI repair bundle regression tests passed.");
