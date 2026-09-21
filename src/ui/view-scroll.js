export function preserveViewScroll(content, update) {
  const view = content?.closest?.(".view");
  const top = view?.scrollTop || 0;
  const left = view?.scrollLeft || 0;
  update();
  if (view) {
    view.scrollTop = top;
    view.scrollLeft = left;
  }
}

export function replaceViewContent(content, markup, { text = false } = {}) {
  if (!content) return;
  preserveViewScroll(content, () => {
    if (text) content.textContent = markup;
    else content.innerHTML = markup;
  });
}
