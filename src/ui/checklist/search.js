// DOM-touching checklist search/filter helpers, kept out of app.js to respect
// the coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// Mirrors the workup catalog's Fuse-based filter-in-place pattern
// (src/ui/app.js: workupCatalogMatchIds/updateWorkupCatalogFilter) so typing
// hides non-matching rows without a full re-render.
export function createChecklistSearchController({ Fuse, normalizeQuery, byId }) {
  let index = null;

  function buildIndex(snapshot) {
    index = snapshot?.items?.length
      ? new Fuse(snapshot.items, {
          keys: [
            { name: "text", weight: 0.6 },
            { name: "system", weight: 0.25 },
            { name: "workupTitle", weight: 0.15 }
          ],
          ignoreLocation: true,
          minMatchCharLength: 1,
          threshold: 0.35
        })
      : null;
  }

  function matchIds(query) {
    const normalized = normalizeQuery(query);
    if (!normalized) return null;
    return new Set((index?.search(normalized) || []).map((result) => result.item.id));
  }

  function updateFilter(query) {
    const container = byId("checklistSections");
    if (!container) return;
    const matchingIds = matchIds(query);
    const rows = [...container.querySelectorAll(".checklist-item")];
    rows.forEach((row) => {
      const matches = !matchingIds || matchingIds.has(row.dataset.itemId);
      row.hidden = !matches;
      row.style.display = matches ? "" : "none";
    });
    container.querySelectorAll(".checklist-system").forEach((section) => {
      const anyVisible = [...section.querySelectorAll(".checklist-item")].some((row) => !row.hidden);
      section.hidden = !anyVisible;
      section.style.display = anyVisible ? "" : "none";
    });
    const count = document.querySelector("[data-checklist-search-count]");
    if (count) count.textContent = matchingIds ? `${rows.filter((row) => !row.hidden).length} of ${rows.length} items` : `${rows.length} items`;
    const clearButton = document.querySelector('[data-action="clear-checklist-search"]');
    if (clearButton) clearButton.hidden = !matchingIds;
  }

  function clear() {
    const input = byId("checklistSearchInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    updateFilter("");
  }

  return Object.freeze({ buildIndex, updateFilter, clear });
}

// A pure UI expand/collapse toggled directly on the DOM rather than a full
// re-render. The open/closed id set lives in caller state so a later
// re-render (e.g. after answering a different item) doesn't collapse it back.
export function toggleItemNote(button, openNoteIds) {
  const item = button.closest(".checklist-item");
  const itemId = item?.dataset.itemId;
  if (!item || !itemId) return;
  const isOpen = item.classList.toggle("note-open");
  button.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    openNoteIds.add(itemId);
    const input = item.querySelector(".item-note-input");
    if (input) {
      // Force layout so iOS Safari recognizes it is no longer display: none
      void input.offsetHeight; 
      input.focus();
    }
  } else {
    openNoteIds.delete(itemId);
  }
}
