// Controller for the Cheat Sheets pocket reference tab: a read-only,
// patient-independent reference guide. Owns the search query and the
// selected sheet id (the last-viewed id is persisted, guarded for
// non-browser environments). All markup lives in ./presentation.js (pure);
// all search ranking lives in ./search.js (pure).
//
// The data file is bundled with the app as a generated JS module (built
// from src/data/cheat-sheets.json by `npm run build:cheat-sheets-data`) —
// zero network calls, everything works offline, and it loads through plain
// script-module semantics on older mobile browsers that lack JSON import
// attributes. This module touches the DOM only through the injected byId /
// replaceViewContent helpers, like the other feature controllers.
//
// NOTE: a physically absent cheat-sheets.data.js fails module evaluation at
// import time (unavoidable with a static import). The graceful empty state
// covers the cases render() can actually reach: a present-but-empty payload
// ({ "sheets": [] }), a malformed payload, or a persisted sheet id that no
// longer exists.
import { CHEAT_SHEETS_DATA } from "../../data/cheat-sheets.data.js?v=20260929-cheat-sheets-v1";
import { searchSheets, getSheetById } from "./search.js?v=20260929-cheat-sheets-v1";
import { createCheatSheetsPresentation } from "./presentation.js?v=20260929-cheat-sheets-v1";

export function createCheatSheetsController({ app, byId, escapeHtml, replaceViewContent }) {
  const presentation = createCheatSheetsPresentation({ escapeHtml });
  const state = { query: "", sheetId: null };

  const LAST_SHEET_KEY = "prerounding.cheatSheets.lastSheetId.v1";
  // In-memory fallback for environments without localStorage (tests, SSR).
  const memoryStore = new Map();
  const hasLocalStorage = (() => {
    try {
      return typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
    } catch {
      return false;
    }
  })();

  function readLastSheetId() {
    try {
      if (hasLocalStorage) return localStorage.getItem(LAST_SHEET_KEY);
      return memoryStore.get(LAST_SHEET_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function writeLastSheetId(id) {
    try {
      if (hasLocalStorage) {
        if (id) localStorage.setItem(LAST_SHEET_KEY, String(id));
        else localStorage.removeItem(LAST_SHEET_KEY);
      } else if (id) {
        memoryStore.set(LAST_SHEET_KEY, String(id));
      } else {
        memoryStore.delete(LAST_SHEET_KEY);
      }
    } catch {
      // Persistence is a nicety; the tab works fine without it.
    }
  }

  // Restore the last-viewed sheet on tab entry (validated in render()).
  state.sheetId = readLastSheetId();

  // Defensive read of the bundled data: anything that is not a well-formed
  // sheet list degrades to the empty state instead of throwing. A sheet
  // needs at least an id and a non-empty title; everything else renders
  // conditionally (history/exam sections simply omit when absent).
  function getSheets() {
    const data = CHEAT_SHEETS_DATA && typeof CHEAT_SHEETS_DATA === "object" ? CHEAT_SHEETS_DATA : null;
    const sheets = data && Array.isArray(data.sheets) ? data.sheets : [];
    return sheets.filter(
      (sheet) =>
        sheet &&
        typeof sheet === "object" &&
        sheet.id !== undefined &&
        sheet.id !== null &&
        String(sheet.title ?? "").trim() !== ""
    );
  }

  function selectedSheet() {
    if (!state.sheetId) return null;
    return getSheetById(getSheets(), state.sheetId);
  }

  function container() {
    return byId("cheatSheetsContent");
  }

  function render() {
    const el = container();
    if (!el) return;
    const sheets = getSheets();
    if (!sheets.length) {
      replaceViewContent(el, presentation.emptyStateHtml());
      return;
    }
    const sheet = selectedSheet();
    if (sheet) {
      replaceViewContent(el, presentation.sheetDetailHtml(sheet));
      if (typeof el.scrollTo === "function") el.scrollTo({ top: 0 });
      return;
    }
    // A persisted id that no longer resolves falls back to the list view.
    if (state.sheetId) {
      state.sheetId = null;
      writeLastSheetId(null);
    }
    replaceViewContent(
      el,
      presentation.sheetListHtml({
        sheets: searchSheets(sheets, state.query),
        query: state.query,
        total: sheets.length
      })
    );
  }

  // Surgical update for search keystrokes: only the results region is
  // replaced, so the search input keeps focus and the phone keyboard stays
  // open while typing.
  function patchResults() {
    const el = container();
    const slot = el && typeof el.querySelector === "function" ? el.querySelector("[data-cheat-sheets-results]") : null;
    const sheets = getSheets();
    const results = searchSheets(sheets, state.query);
    if (!slot || !el) {
      render();
      return;
    }
    slot.outerHTML = presentation.sheetListResultsHtml({ sheets: results, query: state.query });
    const count = el.querySelector(".cs-count");
    if (count) {
      count.textContent =
        results.length === sheets.length
          ? `${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`
          : `${results.length} of ${sheets.length} sheets`;
    }
  }

  function input(target) {
    if (!target || app.view !== "cheatSheets") return false;
    if (!target.matches?.("[data-cheat-sheets-search]")) return false;
    state.query = target.value ?? "";
    patchResults();
    return true;
  }

  function click(target) {
    if (!target || app.view !== "cheatSheets") return false;
    const openButton = target.closest?.("[data-cheat-sheets-open]");
    if (openButton) {
      state.sheetId = openButton.dataset?.cheatSheetsOpen || null;
      writeLastSheetId(state.sheetId);
      render();
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-back"]')) {
      state.sheetId = null;
      writeLastSheetId(null);
      render();
      return true;
    }
    return false;
  }

  return { render, click, input, getOpenSheetId: () => state.sheetId };
}
