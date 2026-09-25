// Smart `$` autocomplete for the draft note editor.
// Typing `$` followed by text in any draft note contenteditable region shows
// a dropdown of matching labs/vitals from the clinical data index. Selecting
// one inserts its compact value text (e.g. "K 4.2") at the cursor.
//
// This module attaches once to the review content container via event
// delegation, so it survives the controller's full re-renders.

const TRIGGER_PATTERN = /\$([A-Za-z0-9_.\-]*)$/;
const MAX_SUGGESTIONS = 8;

export function createLabAutocomplete({ getCandidates }) {
  let container = null;
  let dropdown = null;
  let activeTrigger = null; // { element, query, range }
  let selectedIndex = 0;
  let currentSuggestions = [];

  function ensureDropdown() {
    if (dropdown) return dropdown;
    dropdown = document.createElement("div");
    dropdown.className = "lab-autocomplete-dropdown";
    dropdown.setAttribute("role", "listbox");
    dropdown.hidden = true;
    document.body.appendChild(dropdown);
    return dropdown;
  }

  function getCandidatesList() {
    try {
      return getCandidates() || [];
    } catch {
      return [];
    }
  }

  // Find the `$query` immediately before the cursor in a contenteditable.
  function findTrigger(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) return null;
    if (!range.collapsed) return null;

    // Get text from element start to cursor.
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    const match = textBefore.match(TRIGGER_PATTERN);
    if (!match) return null;

    return { element, query: match[1], triggerLength: match[0].length, range: range.cloneRange() };
  }

  function filterCandidates(query) {
    const q = query.toLowerCase().trim();
    const candidates = getCandidatesList();
    if (!q) return candidates.slice(0, MAX_SUGGESTIONS);
    return candidates
      .filter((c) => {
        const searchText = (c.searchText || "").toLowerCase();
        const name = (c.name || "").toLowerCase();
        return searchText.includes(q) || name.includes(q);
      })
      .slice(0, MAX_SUGGESTIONS);
  }

  function positionDropdown(trigger) {
    const dd = ensureDropdown();
    const range = trigger.range;
    const rect = range.getBoundingClientRect();
    // Position below the cursor, with fallback to above if near viewport bottom.
    const ddHeight = Math.min(currentSuggestions.length * 40 + 8, 320);
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
      .map((candidate, index) => {
        const isSelected = index === selectedIndex;
        const displayName = escapeHtml(candidate.name || "Unknown");
        const displayValue = escapeHtml(candidate.insertionText || candidate.noteLabel || "");
        return `<div class="lab-autocomplete-item ${isSelected ? "is-selected" : ""}" role="option" aria-selected="${isSelected}" data-index="${index}">
          <span class="lab-autocomplete-name">${displayName}</span>
          <span class="lab-autocomplete-value">${displayValue}</span>
        </div>`;
      })
      .join("");
    dd.hidden = false;
    positionDropdown(activeTrigger);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function hideDropdown() {
    activeTrigger = null;
    currentSuggestions = [];
    selectedIndex = 0;
    if (dropdown) dropdown.hidden = true;
  }

  function updateSuggestions() {
    if (!activeTrigger) return;
    currentSuggestions = filterCandidates(activeTrigger.query);
    selectedIndex = 0;
    renderDropdown();
  }

  function insertSuggestion(candidate) {
    if (!activeTrigger || !candidate) return;
    const { element, triggerLength } = activeTrigger;
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // Find and delete the `$query` text before the cursor.
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    const match = textBefore.match(TRIGGER_PATTERN);
    if (!match) return;

    // Create a range covering just the trigger text and replace it.
    const triggerRange = range.cloneRange();
    // Walk backwards triggerLength characters.
    let charsToDelete = triggerLength;
    let node = range.startContainer;
    let offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE) {
      const startOffset = Math.max(0, offset - charsToDelete);
      triggerRange.setStart(node, startOffset);
      triggerRange.setEnd(node, offset);
    } else {
      // Cursor is in an element node; find the text node before it.
      triggerRange.selectNodeContents(element);
      triggerRange.setEnd(range.startContainer, range.startOffset);
      // Simplify: delete via the pre-range text manipulation is complex here.
      // Fall back to collapsing and inserting (leaves the $query, user can delete).
      // For now, just insert at cursor.
      triggerRange.collapse(false);
    }

    triggerRange.deleteContents();
    const textNode = document.createTextNode(candidate.insertionText || candidate.name);
    triggerRange.insertNode(textNode);

    // Move cursor after the inserted text.
    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // Trigger input event so the draft saves.
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));

    hideDropdown();
    element.focus();
  }

  function handleInput(event) {
    const element = event.target.closest("[contenteditable='true']");
    if (!element || !container.contains(element)) {
      hideDropdown();
      return;
    }
    const trigger = findTrigger(element);
    if (!trigger) {
      hideDropdown();
      return;
    }
    const queryChanged = !activeTrigger || activeTrigger.query !== trigger.query || activeTrigger.element !== element;
    activeTrigger = trigger;
    if (queryChanged) {
      updateSuggestions();
    } else {
      // Reposition as the user types.
      if (dropdown && !dropdown.hidden) positionDropdown(trigger);
    }
  }

  function handleKeydown(event) {
    if (!activeTrigger || !dropdown || dropdown.hidden) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
      renderDropdown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderDropdown();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertSuggestion(currentSuggestions[selectedIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hideDropdown();
    }
  }

  function handleClick(event) {
    const item = event.target.closest(".lab-autocomplete-item");
    if (item && dropdown.contains(item)) {
      event.preventDefault();
      const index = parseInt(item.dataset.index, 10);
      insertSuggestion(currentSuggestions[index]);
      return;
    }
    // Click outside closes the dropdown.
    if (dropdown && !dropdown.hidden && !dropdown.contains(event.target)) {
      hideDropdown();
    }
  }

  function attach(reviewContainer) {
    if (container === reviewContainer) return;
    detach();
    container = reviewContainer;
    if (!container) return;
    container.addEventListener("input", handleInput);
    container.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleClick);
  }

  function detach() {
    if (container) {
      container.removeEventListener("input", handleInput);
      container.removeEventListener("keydown", handleKeydown);
      container = null;
    }
    document.removeEventListener("click", handleClick);
    hideDropdown();
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }

  return Object.freeze({ attach, detach, hide: hideDropdown });
}
