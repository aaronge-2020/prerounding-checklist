// A drag starts on an existing highlight or its handle. Gestures outside the
// highlight remain native text selection.
// All selected text stays in this tab and is invalidated with its workspace.
const SOURCE = "[data-note-original], [data-structured-note-field]";
const ROOT = "[data-structured-primary-note-scope]";
const INDEX = "[data-note-index-field]";

function insideSelection(selection, x, y, doc) {
  const { source, from, text, start, end } = selection;
  let range, mirror;
  if (from) {
    if (source.value !== text || source.selectionStart !== start || source.selectionEnd !== end) return false;
    // Textareas do not expose selection rectangles. Mirror their text layout,
    // including wrapping and scroll offsets, for this pointer hit test only.
    const style = doc.defaultView.getComputedStyle(source);
    const box = source.getBoundingClientRect();
    if (x < box.left + source.clientLeft || x >= box.left + source.clientLeft + source.clientWidth ||
        y < box.top + source.clientTop || y >= box.top + source.clientTop + source.clientHeight) return false;
    mirror = doc.createElement("div");
    for (const property of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform", "textAlign", "direction", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) mirror.style[property] = style[property];
    Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", boxSizing: "border-box",
      left: `${box.left + source.clientLeft - source.scrollLeft}px`, top: `${box.top + source.clientTop - source.scrollTop}px`,
      width: `${source.clientWidth}px`, whiteSpace: source.wrap === "off" ? "pre" : "pre-wrap", overflowWrap: "break-word" });
    mirror.textContent = text;
    doc.body.append(mirror);
    range = doc.createRange();
    range.setStart(mirror.firstChild, start);
    range.setEnd(mirror.firstChild, end);
  } else {
    const native = doc.getSelection();
    if (!native?.rangeCount || native.isCollapsed) return false;
    range = native.getRangeAt(0);
    if (!source.contains(range.startContainer) || !source.contains(range.endContainer)) return false;
  }
  const hit = Array.from(range.getClientRects()).some(rect => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom);
  mirror?.remove();
  return hit;
}

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
      selected.root.querySelectorAll(".is-note-drop-target, .is-note-drop-available").forEach(el => el.classList.remove("is-note-drop-target", "is-note-drop-available"));
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
    if (status) status.textContent = `${end - start} characters selected · Drag highlighted text or use Drag selection / a section heading or the Sections list · Esc cancels`;
  }
  // A drop may land on a section card or on that section's entry in the
  // Sections index; both resolve to the same field and share transfer().
  function targetField(el) {
    return el?.dataset.noteDropField ?? el?.dataset.noteIndexField ?? "";
  }
  function dropTargetAt(x, y) {
    const el = doc.elementFromPoint(x, y);
    const card = el?.closest("[data-note-drop-field]");
    if (card?.closest(ROOT) === selected.root) return card;
    const item = el?.closest(INDEX);
    if (item?.closest(ROOT) === selected.root) return item;
    return null;
  }
  function markIndexTargets() {
    selected.root.querySelectorAll(INDEX).forEach(item => {
      if (item.dataset.noteIndexField !== selected.from) item.classList.add("is-note-drop-available");
    });
  }
  function transfer(target) {
    if (!current() || target.closest(ROOT) !== selected.root) { clear(); return; }
    const to = targetField(target);
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
    if (event.button !== 0 || event.shiftKey || !current()) return;
    const handle = event.target.closest?.("[data-note-drag-handle]") ||
      (event.pointerType !== "touch" && event.target.closest?.(SOURCE) === selected.source &&
       insideSelection(selected, event.clientX, event.clientY, doc) ? selected.source : null);
    if (!handle || handle.closest(ROOT) !== selected.root) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle.setPointerCapture(event.pointerId);
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId, handle };
  }, true);
  doc.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id || !current()) return;
    if (!dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    event.preventDefault();
    if (!dragging) {
      dragging = true;
      selected.root.classList.add("is-note-dragging");
      markIndexTargets();
    }
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (!scrollFrame) {
      const scroll = () => {
        if (!pointer || !dragging || !current()) { scrollFrame = 0; return; }
        const sectionPane = selected.root.querySelector(".note-arrange-sections");
        const sectionRect = sectionPane?.getBoundingClientRect();
        const overSections = sectionRect && pointer.lastX >= sectionRect.left && pointer.lastX <= sectionRect.right &&
          pointer.lastY >= sectionRect.top && pointer.lastY <= sectionRect.bottom;
        // The Sections index deliberately does not edge-scroll: its items are
        // short, so sliding them under a stationary pointer would move the
        // highlighted item away and drop onto a different section.
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
    const target = dropTargetAt(event.clientX, event.clientY);
    if (target && targetField(target) !== selected.from) target.classList.add("is-note-drop-target");
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
    const target = dropTargetAt(event.clientX, event.clientY);
    if (target) transfer(target); else clear();
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
    if (event.target.matches?.("textarea") && event.target.closest(ROOT)) clear();
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
