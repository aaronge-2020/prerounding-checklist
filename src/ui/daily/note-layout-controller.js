// Keep the note a single scrolling document, including browsers without
// field-sizing support. No chart values leave their existing textareas.
export function createNoteLayoutController(doc = document) {
  const fields = new Set();
  const widths = new WeakMap();
  let frame = 0;
  function fit(field) {
    if (!field.isConnected || !field.getClientRects().length) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight + 2}px`;
  }
  const resize = new ResizeObserver(entries => {
    for (const { target, contentRect } of entries) {
      if (widths.get(target) === contentRect.width) continue;
      widths.set(target, contentRect.width);
      fit(target);
    }
  });
  function prune() {
    for (const field of fields) {
      if (!field.isConnected) { resize.unobserve(field); fields.delete(field); }
    }
  }
  function refresh() {
    frame = 0;
    prune();
    for (const field of doc.querySelectorAll(".note-section-card textarea")) {
      if (!fields.has(field)) { fields.add(field); resize.observe(field); }
      fit(field);
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(refresh); }
  new MutationObserver(() => { prune(); schedule(); }).observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener("input", event => {
    if (event.target.matches?.(".note-section-card textarea")) fit(event.target);
  });
  doc.addEventListener("toggle", schedule, true);
  schedule();
}
