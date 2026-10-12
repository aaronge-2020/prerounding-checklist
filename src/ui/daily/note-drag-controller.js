// Native selection/drag is session-only. The drag payload carries an opaque token,
// never chart text. A detached workspace invalidates every pending selection.
const MIME = "application/x-preround-note-selection";
const SOURCE = "[data-note-original], [data-structured-note-field]";
const ROOT = "[data-structured-primary-note-scope]";

export function createNoteDragController({ context, apply, report, doc = document }) {
  let selected = null;
  let dragging = false;
  let pointer = null;
  let ghost = null;
  let scrollFrame = 0;
  function clear() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    ghost?.remove();
    ghost = null;
    pointer = null;
    if (selected?.root.isConnected) {
      selected.root.classList.remove("has-note-selection");
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
  function hitsHighlight(event) {
    if (!selected.from) {
      const range = doc.getSelection()?.rangeCount ? doc.getSelection().getRangeAt(0) : null;
      return range && [...range.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    }
    // Measure a textarea selection with an ephemeral, noninteractive mirror.
    // Clicking elsewhere in the field must continue to place a caret normally.
    const source = selected.source;
    const rect = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const mirror = doc.createElement("div");
    for (const key of ["font", "letterSpacing", "lineHeight", "padding", "border", "boxSizing", "textIndent", "tabSize"]) mirror.style[key] = style[key];
    Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", whiteSpace: "pre-wrap", overflowWrap: "break-word", width: `${rect.width}px`, left: `${rect.left - source.scrollLeft}px`, top: `${rect.top - source.scrollTop}px` });
    const span = doc.createElement("span");
    span.textContent = selected.text.slice(selected.start, selected.end);
    mirror.append(doc.createTextNode(selected.text.slice(0, selected.start)), span, doc.createTextNode(selected.text.slice(selected.end)));
    doc.body.append(mirror);
    const hit = [...span.getClientRects()].some(box => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
    mirror.remove();
    return hit;
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
    selected = { root, source, scope, identity: state.identity, from, text, start, end, token: crypto.randomUUID() };
    root.classList.add("has-note-selection");
    const status = root.querySelector("[data-note-selection-status]");
    if (status) status.textContent = `${end - start} characters selected · ${from ? "Move" : "Copy"} by dragging or tapping a section heading · Esc cancels`;
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
  // Native selection dragging differs across textarea implementations. Track a
  // mouse/pen gesture from the existing highlight without exporting chart text.
  doc.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.pointerType === "touch" || !current()) return;
    if (event.target !== selected.source || !hitsHighlight(event)) return;
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  doc.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id || !current()) return;
    if (!dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    event.preventDefault();
    dragging = true;
    pointer.lastY = event.clientY;
    if (!scrollFrame) {
      const scroll = () => {
        if (!pointer || !dragging || !current()) { scrollFrame = 0; return; }
        const pane = selected.root.closest(".stay-content") || selected.root.closest(".view");
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
    if (!pointer || event.pointerId !== pointer.id) return;
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
  doc.addEventListener("keydown", event => { if (event.key === "Escape") clear(); });
  doc.addEventListener("click", event => {
    const heading = event.target.closest?.(".note-section-title");
    if (!heading || !current()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    transfer(heading.closest("[data-note-drop-field]"));
  }, true);
  doc.addEventListener("dragstart", event => {
    if (pointer) { event.preventDefault(); return; }
    const source = event.target.closest?.(SOURCE);
    if (!source) return;
    capture(source);
    if (!current()) { event.preventDefault(); return; }
    dragging = true;
    event.dataTransfer.clearData();
    event.dataTransfer.setData(MIME, selected.token);
    event.dataTransfer.effectAllowed = selected.from ? "move" : "copy";
  });
  doc.addEventListener("dragover", event => {
    const root = event.target.closest?.(ROOT);
    if (!root) return;
    // Block native textarea insertion, including unrelated/external drags.
    event.preventDefault();
    root.querySelectorAll(".is-note-drop-target").forEach(el => el.classList.remove("is-note-drop-target"));
    const card = event.target.closest("[data-note-drop-field]");
    const valid = current() && root === selected.root && card && card.dataset.noteDropField !== selected.from;
    event.dataTransfer.dropEffect = valid ? (selected.from ? "move" : "copy") : "none";
    if (valid) card.classList.add("is-note-drop-target");
  });
  doc.addEventListener("dragleave", event => {
    const card = event.target.closest?.("[data-note-drop-field]");
    if (card && !card.contains(event.relatedTarget)) card.classList.remove("is-note-drop-target");
  });
  doc.addEventListener("drop", event => {
    if (!event.target.closest?.(ROOT)) return;
    event.preventDefault();
    const card = event.target.closest("[data-note-drop-field]");
    if (card && current() && event.dataTransfer.getData(MIME) === selected.token) transfer(card);
    else clear();
  });
  doc.addEventListener("dragend", clear);
  doc.defaultView?.addEventListener("blur", clear);
  new MutationObserver(() => { if (selected && !current()) clear(); })
    .observe(doc.body, { childList: true, subtree: true });
  return { clear };
}
