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
import { CHEAT_SHEETS_DATA } from "../../data/cheat-sheets.data.js?v=20260929-cheatsheets-v2";
import { searchSheets, getSheetById } from "./search.js?v=20260929-cheat-sheets-v1";
import { createCheatSheetsPresentation } from "./presentation.js?v=20260929-cheat-sheets-v1";

export function createCheatSheetsController({ app, byId, escapeHtml, replaceViewContent }) {
  const presentation = createCheatSheetsPresentation({ escapeHtml });
  const state = { query: "", sheetId: null, listScrollTop: 0, listScrollLeft: 0 };

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

  // The route's scroll owner: .view on wide screens, the document below the
  // 1040px breakpoint (where .view is overflow:visible).
  function scrollOwner() {
    const view = container()?.closest(".view");
    if (view && view.scrollHeight > view.clientHeight + 4) return view;
    if (typeof document !== "undefined") return document.scrollingElement || document.documentElement;
    return null;
  }

  function blurFocused() {
    const el = container();
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && active !== document.body && el?.contains(active)) {
      try {
        active.blur();
      } catch {
        /* ignore */
      }
    }
  }

  // Master-detail uses persistent list/detail sections toggled via `hidden`.
  // The list DOM is never destroyed on navigation, so its scroll position,
  // focus, and input state survive. Only the hidden detail section gets
  // populated when opening a sheet.
  function ensureSections(el) {
    let list = el.querySelector("[data-cheat-sheets-list]");
    let detail = el.querySelector("[data-cheat-sheets-detail]");
    if (!list) {
      list = document.createElement("div");
      list.setAttribute("data-cheat-sheets-list", "");
      el.append(list);
    }
    if (!detail) {
      detail = document.createElement("div");
      detail.setAttribute("data-cheat-sheets-detail", "");
      detail.hidden = true;
      el.append(detail);
    }
    return { list, detail };
  }

  function populateList(list) {
    const sheets = getSheets();
    const template = document.createElement("template");
    template.innerHTML = presentation.sheetListHtml({
      sheets: searchSheets(sheets, state.query),
      query: state.query,
      total: sheets.length
    });
    list.replaceChildren(...template.content.childNodes);
  }

  // Master-detail navigation owns scroll explicitly and toggles the
  // persistent sections directly (no wholesale innerHTML replacement).
  function openSheetDetail(sheet) {
    const el = container();
    if (!el) return;
    const { list, detail } = ensureSections(el);
    const owner = scrollOwner();
    state.listScrollTop = owner ? owner.scrollTop : 0;
    state.listScrollLeft = owner ? owner.scrollLeft : 0;
    blurFocused();
    const template = document.createElement("template");
    template.innerHTML = presentation.sheetDetailHtml(sheet);
    detail.replaceChildren(...template.content.childNodes);
    list.hidden = true;
    detail.hidden = false;
    if (owner) {
      owner.scrollTop = 0;
      owner.scrollLeft = 0;
    }
  }

  function closeSheetDetail() {
    const el = container();
    if (!el) return;
    const { list, detail } = ensureSections(el);
    blurFocused();
    detail.hidden = true;
    list.hidden = false;
    const owner = scrollOwner();
    if (owner) {
      owner.scrollTop = Math.min(state.listScrollTop, Math.max(0, owner.scrollHeight - owner.clientHeight));
      owner.scrollLeft = state.listScrollLeft || 0;
    }
  }

  function render() {
    const el = container();
    if (!el) return;
    const sheets = getSheets();
    const { list, detail } = ensureSections(el);
    if (!sheets.length) {
      const template = document.createElement("template");
      template.innerHTML = presentation.emptyStateHtml();
      list.replaceChildren(...template.content.childNodes);
      list.hidden = false;
      detail.hidden = true;
      return;
    }
    const sheet = selectedSheet();
    if (!list.hasChildNodes()) populateList(list);
    if (sheet) {
      if (detail.hidden || !detail.hasChildNodes()) {
        const template = document.createElement("template");
        template.innerHTML = presentation.sheetDetailHtml(sheet);
        detail.replaceChildren(...template.content.childNodes);
      }
      list.hidden = true;
      detail.hidden = false;
      return;
    }
    if (state.sheetId) {
      state.sheetId = null;
      writeLastSheetId(null);
    }
    list.hidden = false;
    detail.hidden = true;
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
    const template = document.createElement("template");
    template.innerHTML = presentation.sheetListResultsHtml({ sheets: results, query: state.query });
    const newSlot = template.content.firstElementChild;
    if (newSlot) {
      slot.replaceChildren(...newSlot.childNodes);
      slot.className = newSlot.className;
    }
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
      const id = openButton.dataset?.cheatSheetsOpen || null;
      state.sheetId = id;
      writeLastSheetId(state.sheetId);
      const sheet = getSheetById(getSheets(), id);
      if (sheet) {
        openSheetDetail(sheet);
      } else {
        render();
      }
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-back"]')) {
      state.sheetId = null;
      writeLastSheetId(null);
      closeSheetDetail();
      return true;
    }
    return false;
  }

  return { render, click, input, getOpenSheetId: () => state.sheetId };
}
