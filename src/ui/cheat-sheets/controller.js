import { safeHtml } from "../../lib/safe-html.js?v=20261012-safety";
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
import { CHEAT_SHEETS_DATA } from "../../data/cheat-sheets.data.js?v=20261026-cheatsheets-v5";
import { searchSheets, getSheetById } from "./search.js?v=20260929-cheat-sheets-v1";
import { createCheatSheetsPresentation } from "./presentation.js?v=20260929-cheat-sheets-v1";

export function createCheatSheetsController({ app, byId, escapeHtml, replaceViewContent }) {
  const presentation = createCheatSheetsPresentation({ escapeHtml });
  const state = { query: "", sheetId: null, listScrollTop: 0, listScrollLeft: 0 };
  // Fillable worksheet (MSE sheet only): answers live in this Map for the
  // page session only — never persisted, never sent anywhere. Keyed by
  // sheet id, then item id, then field index ->
  // { selected: Set<string>, text: string, detail: string }, so going
  // back to the reference view and returning keeps the answers.
  state.worksheetOpen = false;
  state.worksheetAnswers = new Map();

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

  function answersFor(sheet) {
    if (!sheet) return new Map();
    let answers = state.worksheetAnswers.get(sheet.id);
    if (!answers) {
      answers = new Map();
      state.worksheetAnswers.set(sheet.id, answers);
    }
    return answers;
  }

  function answerEntry(answers, itemId, fieldIndex) {
    let perItem = answers.get(itemId);
    if (!perItem) {
      perItem = new Map();
      answers.set(itemId, perItem);
    }
    let entry = perItem.get(fieldIndex);
    if (!entry) {
      entry = { selected: new Set(), text: "", detail: "" };
      perItem.set(fieldIndex, entry);
    }
    return entry;
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
    // Populate the (possibly empty) list section. The search input keeps
    // focus because patchResults() updates only the results slot.
    const template = document.createElement("template");
    template.innerHTML = safeHtml(presentation.sheetListHtml({
      sheets: searchSheets(sheets, state.query),
      query: state.query,
      total: sheets.length
    }));
    list.replaceChildren(...template.content.childNodes);
  }

  // Master-detail navigation owns scroll explicitly. render()'s
  // replaceViewContent would restore the list's position onto the detail (and
  // vice versa on back), and its deferred restores would fight an explicit
  // scroll — so navigation toggles the persistent sections directly.
  function openSheetDetail(sheet) {
    const el = container();
    if (!el) return;
    const { list, detail } = ensureSections(el);
    const owner = scrollOwner();
    state.listScrollTop = owner ? owner.scrollTop : 0;
    state.listScrollLeft = owner ? owner.scrollLeft : 0;
    blurFocused();
    // Populate the hidden detail section, then swap visibility. The list DOM
    // stays intact underneath.
    const template = document.createElement("template");
    template.innerHTML = safeHtml(presentation.sheetDetailHtml(sheet));
    detail.replaceChildren(...template.content.childNodes);
    list.hidden = true;
    detail.hidden = false;
    if (owner) {
      owner.scrollTop = 0;
      owner.scrollLeft = 0;
    }
  }

  // Worksheet rendering swaps the detail section's content in place (the
  // list stays intact underneath, exactly like sheet navigation). Chip
  // toggles re-render with the scroll position restored; opening the
  // worksheet starts at the top.
  function renderWorksheet({ keepScroll = false } = {}) {
    const el = container();
    const sheet = selectedSheet();
    if (!el || !sheet) return;
    const { list, detail } = ensureSections(el);
    const owner = scrollOwner();
    const top = keepScroll && owner ? owner.scrollTop : 0;
    const left = keepScroll && owner ? owner.scrollLeft : 0;
    const template = document.createElement("template");
    template.innerHTML = safeHtml(presentation.worksheetHtml(sheet, answersFor(sheet)));
    detail.replaceChildren(...template.content.childNodes);
    list.hidden = true;
    detail.hidden = false;
    if (owner) {
      owner.scrollTop = top;
      owner.scrollLeft = left;
    }
  }

  // Note inputs update state without a re-render (focus and caret must
  // survive): only the output textarea, the progress text, and the Copy
  // button's disabled state are refreshed.
  function refreshWorksheetOutput() {
    const el = container();
    const sheet = selectedSheet();
    if (!el || !sheet) return;
    const answers = answersFor(sheet);
    const noteText = presentation.worksheetNoteText(sheet, answers);
    const output = el.querySelector("#cheat-sheets-worksheet-output");
    if (output) {
      output.value = noteText;
      output.rows = Math.max(4, noteText ? noteText.split("\n").length + 1 : 4);
    }
    const progress = el.querySelector("[data-worksheet-progress]");
    if (progress) progress.textContent = presentation.worksheetProgressText(sheet, answers);
    const copy = el.querySelector('[data-action="cheat-sheets-worksheet-copy"]');
    if (copy) copy.disabled = !noteText;
  }

  function closeSheetDetail() {
    const el = container();
    if (!el) return;
    const { list, detail } = ensureSections(el);
    blurFocused();
    // The list DOM was never destroyed, so just reveal it. No re-render.
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
      const { list, detail } = ensureSections(el);
      const template = document.createElement("template");
      template.innerHTML = safeHtml(presentation.emptyStateHtml());
      list.replaceChildren(...template.content.childNodes);
      list.hidden = false;
      detail.hidden = true;
      return;
    }
    const sheet = selectedSheet();
    // Populate the list section if empty (first render). Search updates go
    // through patchResults(); navigation toggles visibility without
    // destroying DOM.
    if (!list.hasChildNodes()) populateList(list);
    if (sheet) {
      // Plain re-render while the detail is open (e.g. after a central
      // render): keep the reader's position. List->detail navigation goes
      // through openSheetDetail(), which starts the detail at the top.
      if (detail.hidden || !detail.hasChildNodes()) {
        const template = document.createElement("template");
        template.innerHTML = safeHtml(
          state.worksheetOpen && sheet.worksheet
            ? presentation.worksheetHtml(sheet, answersFor(sheet))
            : presentation.sheetDetailHtml(sheet)
        );
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

  // Surgical update for search keystrokes: only the results region's children
  // are updated, so the search input keeps focus and the phone keyboard stays
  // open while typing. The slot element itself persists.
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
    template.innerHTML = safeHtml(presentation.sheetListResultsHtml({ sheets: results, query: state.query }));
    const newSlot = template.content.firstElementChild;
    if (newSlot) {
      // Preserve the slot element; update its content and class (ul.cs-cards
      // vs div.cs-empty).
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
    if (target.matches?.("[data-worksheet-detail]")) {
      const sheet = selectedSheet();
      if (!sheet) return false;
      const entry = answerEntry(
        answersFor(sheet),
        target.dataset.worksheetDetail,
        Number(target.dataset.worksheetField)
      );
      entry.detail = target.value ?? "";
      refreshWorksheetOutput();
      return true;
    }
    if (!target.matches?.("[data-cheat-sheets-search]")) return false;
    state.query = target.value ?? "";
    patchResults();
    return true;
  }

  // Copy the visible note text. On success the button shows "Copied" for
  // two seconds; if the clipboard is unavailable or blocked, the textarea
  // text is selected and a plain instruction appears instead.
  function copyWorksheetText(button) {
    const el = container();
    const sheet = selectedSheet();
    if (!el || !sheet) return;
    const noteText = presentation.worksheetNoteText(sheet, answersFor(sheet));
    const output = el.querySelector("#cheat-sheets-worksheet-output");
    const hint = el.querySelector("[data-worksheet-copy-hint]");
    const showFallback = () => {
      if (output) {
        output.focus();
        output.select();
      }
      if (hint) {
        hint.textContent = "The note text above is selected. Copy it with Ctrl+C (or long-press on a phone).";
        hint.hidden = false;
      }
    };
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      showFallback();
      return;
    }
    navigator.clipboard.writeText(noteText).then(
      () => {
        if (hint) hint.hidden = true;
        if (button) {
          const original = button.textContent;
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = original;
          }, 2000);
        }
      },
      () => {
        showFallback();
      }
    );
  }

  function click(target) {
    if (!target || app.view !== "cheatSheets") return false;
    const openButton = target.closest?.("[data-cheat-sheets-open]");
    if (openButton) {
      const id = openButton.dataset?.cheatSheetsOpen || null;
      state.sheetId = id;
      state.worksheetOpen = false;
      writeLastSheetId(state.sheetId);
      const sheet = id ? getSheetById(getSheets(), id) : null;
      // Explicit navigation: the detail starts at the top; the list position
      // is remembered for the back button.
      if (sheet) openSheetDetail(sheet);
      else render();
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-open-worksheet"]')) {
      const sheet = selectedSheet();
      if (!sheet || !sheet.worksheet) return false;
      answersFor(sheet);
      state.worksheetOpen = true;
      renderWorksheet();
      return true;
    }
    const chip = target.closest?.("[data-worksheet-chip]");
    if (chip) {
      const sheet = selectedSheet();
      if (!sheet) return false;
      const item = (sheet.exam || []).find((entry) => String(entry.id) === chip.dataset.worksheetChip);
      const fieldIndex = Number(chip.dataset.worksheetField);
      const field = item && (item.fields || [])[fieldIndex];
      if (!field) return false;
      const entry = answerEntry(answersFor(sheet), item.id, fieldIndex);
      const value = chip.dataset.value ?? "";
      entry.selected = new Set(presentation.worksheetChipToggle(field, entry.selected, value));
      renderWorksheet({ keepScroll: true });
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-worksheet-back"]')) {
      // Return to the sheet detail without touching the remembered list
      // scroll position (openSheetDetail would overwrite it).
      const sheet = selectedSheet();
      const el = container();
      state.worksheetOpen = false;
      if (!sheet || !el) {
        render();
        return true;
      }
      const { list, detail } = ensureSections(el);
      blurFocused();
      const template = document.createElement("template");
      template.innerHTML = safeHtml(presentation.sheetDetailHtml(sheet));
      detail.replaceChildren(...template.content.childNodes);
      list.hidden = true;
      detail.hidden = false;
      const owner = scrollOwner();
      if (owner) {
        owner.scrollTop = 0;
        owner.scrollLeft = 0;
      }
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-worksheet-copy"]')) {
      copyWorksheetText(target.closest('[data-action="cheat-sheets-worksheet-copy"]'));
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-worksheet-clear"]')) {
      const sheet = selectedSheet();
      if (!sheet) return false;
      const confirmed =
        typeof window === "undefined" || typeof window.confirm !== "function"
          ? true
          : window.confirm("Clear all answers?");
      if (!confirmed) return true;
      state.worksheetAnswers.set(sheet.id, new Map());
      renderWorksheet({ keepScroll: true });
      return true;
    }
    if (target.closest?.('[data-action="cheat-sheets-back"]')) {
      state.sheetId = null;
      state.worksheetOpen = false;
      writeLastSheetId(null);
      // Explicit navigation back: restore the list's own position instead of
      // inheriting wherever the reader left the detail.
      closeSheetDetail();
      return true;
    }
    return false;
  }

  return { render, click, input, getOpenSheetId: () => state.sheetId };
}
