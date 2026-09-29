// Smart `@` autocomplete for drug lookup in the draft note editor.
// Typing `@` followed by text in any draft note contenteditable region shows
// a dropdown of matching drugs from OpenFDA. Selecting one opens a detail
// panel with the FDA-approved indications and dosage for each indication.
// The user picks what to insert at the cursor.
//
// This module attaches once to the review content container via event
// delegation, so it survives the controller's full re-renders.

import { gatedFetch } from "../../lib/network-gate.js?v=20260929-offline-mode-v1";

const TRIGGER_PATTERN = /@([A-Za-z0-9_.\-]*)$/;
const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 300;
const OPENFDA_SEARCH_URL = "https://api.fda.gov/drug/label.json";

export function createDrugAutocomplete() {
  let container = null;
  let dropdown = null;
  let detailModal = null;
  let activeTrigger = null; // { element, query, range }
  let selectedIndex = 0;
  let currentSuggestions = [];
  let searchTimer = null;
  let searchController = null; // AbortController for in-flight search
  let lastSearchQuery = "";

  function ensureDropdown() {
    if (dropdown) return dropdown;
    dropdown = document.createElement("div");
    dropdown.className = "drug-autocomplete-dropdown";
    dropdown.setAttribute("role", "listbox");
    dropdown.hidden = true;
    document.body.appendChild(dropdown);
    return dropdown;
  }

  function ensureModal() {
    if (detailModal) return detailModal;
    detailModal = document.createElement("div");
    detailModal.className = "drug-detail-modal-backdrop";
    detailModal.hidden = true;
    detailModal.innerHTML = `
      <div class="drug-detail-modal" role="dialog" aria-modal="true" aria-label="Drug details">
        <div class="drug-detail-header">
          <h3 class="drug-detail-title"></h3>
          <button type="button" class="drug-detail-close" aria-label="Close">×</button>
        </div>
        <div class="drug-detail-body"></div>
      </div>`;
    document.body.appendChild(detailModal);
    detailModal.querySelector(".drug-detail-close").addEventListener("click", hideModal);
    detailModal.addEventListener("click", (e) => {
      if (e.target === detailModal) hideModal();
    });
    return detailModal;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Find the `@query` immediately before the cursor in a contenteditable.
  function findTrigger(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) return null;
    if (!range.collapsed) return null;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    const match = textBefore.match(TRIGGER_PATTERN);
    if (!match) return null;

    return { element, query: match[1], triggerLength: match[0].length, range: range.cloneRange() };
  }

  async function searchDrugs(query) {
    if (searchController) searchController.abort();
    searchController = new AbortController();
    
    try {
      // Search by generic name (prefix match). Prefer single-ingredient products.
      const search = `openfda.generic_name:"${query}*"`;
      const url = `${OPENFDA_SEARCH_URL}?search=${encodeURIComponent(search)}&limit=${MAX_SUGGESTIONS}`;
      // OpenFDA suggestions go through the offline-mode gate: while
      // offline mode is on this fails fast and the dropdown stays empty.
      const resp = await gatedFetch(url, { signal: searchController.signal });
      if (!resp.ok) return [];
      const data = await resp.json();
      const results = data.results || [];
      
      // Sort: exact generic name matches first, then single-ingredient, then others.
      const q = query.toLowerCase();
      return results
        .map(r => {
          const genericNames = (r.openfda && r.openfda.generic_name) || [];
          const brandNames = (r.openfda && r.openfda.brand_name) || [];
          const generic = genericNames[0] || "Unknown";
          const isExact = generic.toLowerCase() === q;
          const isSingleIngredient = genericNames.length === 1 && !generic.includes(";");
          return { label: r, generic, brandNames, isExact, isSingleIngredient };
        })
        .sort((a, b) => {
          if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
          if (a.isSingleIngredient !== b.isSingleIngredient) return a.isSingleIngredient ? -1 : 1;
          return a.generic.localeCompare(b.generic);
        });
    } catch (err) {
      if (err.name === "AbortError") return null; // Signal: ignore, new search in flight
      if (err && err.name === "OfflineBlockedError") return []; // Offline mode: no suggestions, no noise
      console.warn("Drug search failed:", err);
      return [];
    }
  }

  function positionDropdown(trigger) {
    const dd = ensureDropdown();
    const range = trigger.range;
    const rect = range.getBoundingClientRect();
    const ddHeight = Math.min(currentSuggestions.length * 48 + 8, 320);
    let top = rect.bottom + window.scrollY + 4;
    if (top + ddHeight > window.scrollY + window.innerHeight - 16) {
      top = rect.top + window.scrollY - ddHeight - 4;
    }
    dd.style.left = `${rect.left + window.scrollX}px`;
    dd.style.top = `${Math.max(8, top)}px`;
  }

  function renderDropdown() {
    const dd = ensureDropdown();
    if (!currentSuggestions.length || !activeTrigger) {
      dd.hidden = true;
      return;
    }
    dd.innerHTML = currentSuggestions
      .map((item, index) => {
        const isSelected = index === selectedIndex;
        const generic = escapeHtml(item.generic);
        const brand = item.brandNames.length > 0 
          ? escapeHtml(item.brandNames.slice(0, 2).join(", ")) 
          : "";
        return `<div class="drug-autocomplete-item ${isSelected ? "is-selected" : ""}" role="option" aria-selected="${isSelected}" data-index="${index}">
          <span class="drug-autocomplete-name">${generic}</span>
          ${brand ? `<span class="drug-autocomplete-brand">${brand}</span>` : ""}
        </div>`;
      })
      .join("");
    dd.hidden = false;
    positionDropdown(activeTrigger);
  }

  function hideDropdown() {
    activeTrigger = null;
    currentSuggestions = [];
    selectedIndex = 0;
    lastSearchQuery = "";
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (dropdown) dropdown.hidden = true;
  }

  function scheduleSearch() {
    if (!activeTrigger) return;
    const query = activeTrigger.query.trim();
    if (query === lastSearchQuery) return;
    if (query.length < 2) {
      currentSuggestions = [];
      renderDropdown();
      return;
    }
    
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const currentQuery = activeTrigger ? activeTrigger.query.trim() : "";
      if (currentQuery !== query) return; // Stale
      lastSearchQuery = query;
      
      // Show loading state
      const dd = ensureDropdown();
      dd.innerHTML = `<div class="drug-autocomplete-loading">Searching drugs…</div>`;
      dd.hidden = false;
      if (activeTrigger) positionDropdown(activeTrigger);
      
      const results = await searchDrugs(query);
      if (results === null) return; // Aborted, new search in flight
      if (!activeTrigger || activeTrigger.query.trim() !== query) return; // Stale
      
      currentSuggestions = results;
      selectedIndex = 0;
      renderDropdown();
    }, DEBOUNCE_MS);
  }

  function cleanLabelText(text) {
    if (!text) return "";
    // Remove section number markers like "( 1 )", "( 2.1 )"
    let cleaned = text.replace(/\(\s*\d+(\.\d+)*\s*\)/g, "");
    // Remove the leading "1 INDICATIONS AND USAGE" or "2 DOSAGE AND ADMINISTRATION"
    cleaned = cleaned.replace(/^\d+\s+[A-Z\s]+?(?=[A-Z][a-z])/, "");
    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned;
  }

  function parseIndications(label) {
    const raw = (label.indications_and_usage || []).join(" ");
    const cleaned = cleanLabelText(raw);
    // Split into sentences for display
    const sentences = cleaned.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 6); // Limit to first 6 for readability
  }

  function parseDosages(label) {
    const raw = (label.dosage_and_administration || []).join(" ");
    const cleaned = cleanLabelText(raw);
    // Split into sentences
    const sentences = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(s => s.trim().length > 15);
    return sentences.slice(0, 10); // Limit to first 10
  }

  function showDrugDetail(item) {
    const modal = ensureModal();
    const label = item.label;
    const generic = item.generic;
    const brandNames = item.brandNames;
    
    const indications = parseIndications(label);
    const dosages = parseDosages(label);
    
    const titleEl = modal.querySelector(".drug-detail-title");
    titleEl.innerHTML = `${escapeHtml(generic)}${brandNames.length > 0 ? ` <span class="drug-detail-brand">(${escapeHtml(brandNames.slice(0, 3).join(", "))})</span>` : ""}`;
    
    const bodyEl = modal.querySelector(".drug-detail-body");
    bodyEl.innerHTML = `
      ${indications.length > 0 ? `
        <div class="drug-detail-section">
          <h4>Indications</h4>
          <ul class="drug-detail-list">
            ${indications.map(ind => `
              <li>
                <span class="drug-detail-text">${escapeHtml(ind)}</span>
                <button type="button" class="drug-insert-btn" data-insert-type="indication" data-text="${escapeHtml(generic + " — " + ind.substring(0, 120))}">Insert</button>
              </li>`).join("")}
          </ul>
        </div>` : `<p class="drug-detail-empty">No indication information in this label.</p>`}
      
      ${dosages.length > 0 ? `
        <div class="drug-detail-section">
          <h4>Dosage & Administration</h4>
          <ul class="drug-detail-list">
            ${dosages.map(dose => `
              <li>
                <span class="drug-detail-text">${escapeHtml(dose)}</span>
                <button type="button" class="drug-insert-btn" data-insert-type="dosage" data-text="${escapeHtml(generic + ": " + dose.substring(0, 150))}">Insert</button>
              </li>`).join("")}
          </ul>
        </div>` : `<p class="drug-detail-empty">No dosage information in this label.</p>`}
      
      <div class="drug-detail-footer">
        <p class="drug-detail-source">Source: FDA-approved labeling via OpenFDA</p>
        <button type="button" class="drug-insert-btn drug-insert-name" data-insert-type="name" data-text="${escapeHtml(generic)}">Insert name only</button>
      </div>`;
    
    // Wire up insert buttons
    bodyEl.querySelectorAll(".drug-insert-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-text");
        insertDrugText(text);
        hideModal();
      });
    });
    
    modal.hidden = false;
    // Focus the close button for accessibility
    modal.querySelector(".drug-detail-close").focus();
  }

  function hideModal() {
    if (detailModal) detailModal.hidden = true;
    // Return focus to the editor
    if (activeTrigger && activeTrigger.element) {
      activeTrigger.element.focus();
    }
  }

  function insertDrugText(text) {
    if (!activeTrigger || !text) return;
    const { element, triggerLength } = activeTrigger;
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    const match = textBefore.match(TRIGGER_PATTERN);
    if (!match) return;

    const triggerRange = range.cloneRange();
    let charsToDelete = triggerLength;
    let node = range.startContainer;
    let offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE) {
      const startOffset = Math.max(0, offset - charsToDelete);
      triggerRange.setStart(node, startOffset);
      triggerRange.setEnd(node, offset);
    } else {
      triggerRange.selectNodeContents(element);
      triggerRange.setEnd(range.startContainer, range.startOffset);
      triggerRange.collapse(false);
    }

    triggerRange.deleteContents();
    const textNode = document.createTextNode(text);
    triggerRange.insertNode(textNode);

    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    hideDropdown();
    element.focus();
  }

  function selectSuggestion(index) {
    if (index < 0 || index >= currentSuggestions.length) return;
    const item = currentSuggestions[index];
    hideDropdown();
    showDrugDetail(item);
  }

  function handleInput(event) {
    const element = event.target.closest("[contenteditable='true']");
    if (!element || !container.contains(element)) {
      return;
    }
    const trigger = findTrigger(element);
    if (trigger) {
      const isNew = !activeTrigger || activeTrigger.element !== trigger.element;
      activeTrigger = trigger;
      if (isNew) {
        currentSuggestions = [];
        selectedIndex = 0;
        lastSearchQuery = "";
      }
      scheduleSearch();
    } else {
      hideDropdown();
    }
  }

  function handleKeydown(event) {
    if (!activeTrigger || !currentSuggestions.length) {
      // Allow Escape to close modal
      if (event.key === "Escape" && detailModal && !detailModal.hidden) {
        hideModal();
        event.preventDefault();
      }
      return;
    }
    
    if (event.key === "ArrowDown") {
      selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
      renderDropdown();
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      renderDropdown();
      event.preventDefault();
    } else if (event.key === "Enter" || event.key === "Tab") {
      selectSuggestion(selectedIndex);
      event.preventDefault();
    } else if (event.key === "Escape") {
      hideDropdown();
      event.preventDefault();
    }
  }

  function handleClick(event) {
    const item = event.target.closest(".drug-autocomplete-item");
    if (item && dropdown && dropdown.contains(item)) {
      const index = parseInt(item.getAttribute("data-index"), 10);
      selectSuggestion(index);
    }
  }

  function attach(reviewContainer) {
    if (container === reviewContainer) return;
    detach();
    container = reviewContainer;
    container.addEventListener("input", handleInput);
    container.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleClick);
  }

  function detach() {
    if (!container) return;
    container.removeEventListener("input", handleInput);
    container.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("click", handleClick);
    container = null;
    hideDropdown();
    hideModal();
  }

  return Object.freeze({ attach, detach, hide: hideDropdown });
}
