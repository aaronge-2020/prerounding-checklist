// Selection and transfer are separate gestures. Only the handle starts a drag;
// text surfaces always remain native text-selection/editing surfaces.
// All selected text stays in this tab and is invalidated with its workspace.
const SOURCE = "[data-note-original], [data-structured-note-field]";
const ROOT = "[data-structured-primary-note-scope]";

export function createNoteDragController({ context, apply, report, doc = document }) {
  let selected = null;
  let dragging = false;
  let pointer = null;
  let canceledPointer = null;
  let ghost = null;
  let scrollFrame = 0;
  function clear() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    ghost?.remove();
    ghost = null;
    if (pointer) canceledPointer = pointer.id;
    if (pointer?.handle.hasPointerCapture(pointer.id)) pointer.handle.releasePointerCapture(pointer.id);
    pointer = null;
    if (selected?.root.isConnected) {
      selected.root.classList.remove("has-note-selection", "is-note-dragging");
      const handle = selected.root.querySelector("[data-note-drag-handle]");
      if (handle) handle.disabled = true;
      const status = selected.root.querySelector("[data-note-selection-status]");
      if (status) status.textContent = "Text from the original is copied. Text between sections is moved.";
      selected.root.querySelectorAll(".is-note-drop-target").forEach(el => el.classList.remove("is-note-drop-target"));
    }
    selected = null;
    dragging = false;
  }
  function current() {
    return selected?.root.isConnected && context(selected.scope)?.identity === selected.identity;
  }
  function capture(source) {
    const root = source?.closest(ROOT);
    if (!root || !source.matches(SOURCE)) return;
    const scope = root.dataset.structuredPrimaryNoteScope;
    const state = context(scope);
    if (!state) { clear(); return; }
    const from = source.dataset.structuredNoteField || "";
    const text = from ? source.value : source.textContent;
    let start, end;
    if (from) { start = source.selectionStart; end = source.selectionEnd; }
    else {
      const selection = doc.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) { clear(); return; }
      const range = selection.getRangeAt(0);
      if (!source.contains(range.startContainer) || !source.contains(range.endContainer)) { clear(); return; }
      const prefix = range.cloneRange();
      prefix.selectNodeContents(source);
      prefix.setEnd(range.startContainer, range.startOffset);
      start = prefix.toString().length;
      end = start + range.toString().length;
    }
    if (end <= start || !text.slice(start, end).trim()) { clear(); return; }
    clear();
    selected = { root, source, scope, identity: state.identity, from, text, start, end };
    root.classList.add("has-note-selection");
    const handle = root.querySelector("[data-note-drag-handle]");
    if (handle) handle.disabled = false;
    const status = root.querySelector("[data-note-selection-status]");
    if (status) status.textContent = `${end - start} characters selected · ${from ? "Move" : "Copy"} using Drag selection or a section heading · Esc cancels`;
  }
  function transfer(card) {
    if (!current() || card.closest(ROOT) !== selected.root) { clear(); return; }
    const to = card.dataset.noteDropField;
    const selection = selected;
    clear();
    try { apply({ ...selection, to }); }
    catch (error) { report(error.message); }
  }
  const captureEvent = event => {
    if (event.key !== "Escape" && !dragging && !pointer && event.target.matches?.(SOURCE)) capture(event.target);
  };
  // Prevent the browser's selection gesture before it starts, and capture the
  // pointer so crossing a textarea or leaving the handle cannot lose the drag.
  doc.addEventListener("pointerdown", event => {
    canceledPointer = null;
    const handle = event.target.closest?.("[data-note-drag-handle]");
    if (!handle || event.button !== 0 || !current() || handle.closest(ROOT) !== selected.root) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle.setPointerCapture(event.pointerId);
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId, handle };
  }, true);
  doc.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id || !current()) return;
    if (!dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    event.preventDefault();
    dragging = true;
    selected.root.classList.add("is-note-dragging");
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (!scrollFrame) {
      const scroll = () => {
        if (!pointer || !dragging || !current()) { scrollFrame = 0; return; }
        const sectionPane = selected.root.querySelector(".note-arrange-sections");
        const sectionRect = sectionPane?.getBoundingClientRect();
        const overSections = sectionRect && pointer.lastX >= sectionRect.left && pointer.lastX <= sectionRect.right &&
          pointer.lastY >= sectionRect.top && pointer.lastY <= sectionRect.bottom;
        const pane = overSections ? sectionPane : selected.root.closest(".stay-content") || selected.root.closest(".view");
        if (pane) {
          const rect = pane.getBoundingClientRect();
          const delta = pointer.lastY > rect.bottom - 60 ? 10 : pointer.lastY < rect.top + 35 ? -10 : 0;
          if (delta) pane.scrollTop += delta;
        }
        scrollFrame = requestAnimationFrame(scroll);
      };
      scrollFrame = requestAnimationFrame(scroll);
    }
    if (!ghost) {
      ghost = doc.createElement("div");
      ghost.className = "note-drag-ghost";
      ghost.textContent = `${selected.from ? "Move" : "Copy"} ${selected.end - selected.start} characters`;
      doc.body.append(ghost);
    }
    ghost.style.left = `${event.clientX + 12}px`;
    ghost.style.top = `${event.clientY + 12}px`;
    selected.root.querySelectorAll(".is-note-drop-target").forEach(el => el.classList.remove("is-note-drop-target"));
    const card = doc.elementFromPoint(event.clientX, event.clientY)?.closest("[data-note-drop-field]");
    const more = doc.elementFromPoint(event.clientX, event.clientY)?.closest(".note-additional-sections");
    if (more?.closest(ROOT) === selected.root) more.open = true;
    if (card?.closest(ROOT) === selected.root && card.dataset.noteDropField !== selected.from) card.classList.add("is-note-drop-target");
  });
  doc.addEventListener("pointerup", event => {
    if (event.pointerId === canceledPointer) {
      canceledPointer = null;
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.handle.hasPointerCapture(pointer.id)) pointer.handle.releasePointerCapture(pointer.id);
    pointer = null;
    if (!dragging) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const card = doc.elementFromPoint(event.clientX, event.clientY)?.closest("[data-note-drop-field]");
    if (card) transfer(card); else clear();
  }, true);
  doc.addEventListener("pointercancel", () => {
    // Touch scrolling cancels a pointer but must keep the chosen passage so
    // a clinician can scroll to a destination heading and tap it.
    if (pointer || dragging) clear();
  });
  doc.addEventListener("pointerup", captureEvent);
  doc.addEventListener("keyup", captureEvent);
  doc.addEventListener("select", captureEvent, true);
  // Mobile selection handles can change a range without another pointer event.
  doc.addEventListener("selectionchange", () => {
    if (dragging || pointer) return;
    const node = doc.getSelection()?.anchorNode;
    const source = node?.parentElement?.closest("[data-note-original]");
    if (source) capture(source);
  });
  doc.addEventListener("input", event => {
    if (event.target.closest?.(ROOT)) clear();
  }, true);
  doc.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (selected?.from) selected.source.setSelectionRange(selected.end, selected.end);
    else if (selected) doc.getSelection()?.removeAllRanges();
    clear();
  });
  doc.addEventListener("click", event => {
    const heading = event.target.closest?.(".note-section-title");
    if (!heading || !current()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    transfer(heading.closest("[data-note-drop-field]"));
  }, true);
  // Never export a native text drag or allow a native drop to edit a field.
  for (const type of ["dragstart", "dragover", "drop"]) {
    doc.addEventListener(type, event => {
      if (event.target.closest?.(ROOT)) event.preventDefault();
    });
  }
  doc.defaultView?.addEventListener("blur", clear);
  new MutationObserver(() => { if (selected && !current()) clear(); })
    .observe(doc.body, { childList: true, subtree: true });
  return { clear };
}
