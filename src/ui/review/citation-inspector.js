export function installCitationInspector(doc = document) {
  let trigger = null, panel = null, timer = null;
  function clear() {
    clearTimeout(timer);
    if (trigger?.getAttribute('aria-describedby') === 'ap-source-preview') trigger.removeAttribute('aria-describedby');
    panel?.remove(); panel = null; trigger = null;
  }
  function text(parent, tag, value, className = '') {
    const node = doc.createElement(tag);
    node.textContent = value; node.className = className; parent.append(node);
    return node;
  }
  function show(button, expanded = false) {
    if (panel?.tagName === 'DIALOG' && !expanded) return;
    clear();
    let ref;
    try { ref = JSON.parse(button.dataset.apReference); } catch { return; }
    trigger = button;
    panel = doc.createElement(expanded ? 'dialog' : 'div');
    panel.className = expanded ? 'ap-source-dialog' : 'ap-source-preview';
    panel.setAttribute('aria-label', `Source ${ref.id} details`);
    panel.setAttribute('role', expanded ? 'dialog' : 'tooltip');
    text(panel, 'strong', ref.title || `Source ${ref.id}`);
    text(panel, 'p', [ref.authors, ref.journal, ref.year].filter(Boolean).join(' · '));
    if (ref.excerpt) {
      text(panel, 'p', 'Source excerpt supplied by AI', 'ap-source-label');
      text(panel, 'blockquote', ref.excerpt);
      if (ref.sourceLocation) text(panel, 'p', `Location: ${ref.sourceLocation}`);
      text(panel, 'p', 'Not independently verified. Compare this passage and the recommendation with the original source.', 'ap-source-note');
    } else {
      panel.id = 'ap-source-preview';
      trigger.setAttribute('aria-describedby', panel.id);
      text(panel, 'p', 'No source passage was captured for this citation. Open the original source to check whether it supports the recommendation.', 'ap-source-note');
    }
    if (expanded) {
      if (/^https?:\/\//i.test(ref.url || '')) {
        const link = text(panel, 'a', 'Open original source ↗');
        link.href = ref.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        text(panel, 'p', ref.url, 'ap-source-url');
      } else text(panel, 'p', 'No source URL was provided.');
      const close = text(panel, 'button', 'Close'); close.type = 'button';
      close.addEventListener('click', () => panel?.close());
      panel.addEventListener('close', () => { const previous = trigger; clear(); previous?.focus({preventScroll:true}); clear(); });
    } else {
      text(panel, 'p', 'Click citation for source details.', 'ap-source-note');
      panel.addEventListener('pointerenter', () => clearTimeout(timer));
      panel.addEventListener('pointerleave', () => { timer = setTimeout(clear, 180); });
    }
    doc.body.append(panel);
    if (expanded) panel.showModal();
    else {
      const rect = button.getBoundingClientRect(), box = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - box.width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, doc.documentElement.clientHeight - box.height - 8))}px`;
    }
  }
  doc.addEventListener('pointerover', event => {
    const button = event.target.closest?.('[data-ap-reference]');
    if (button && button !== trigger) show(button);
    else if (button) clearTimeout(timer);
  });
  doc.addEventListener('pointerout', event => {
    if (panel?.tagName !== 'DIALOG' && event.target.closest?.('[data-ap-reference]') && !panel?.contains(event.relatedTarget)) timer = setTimeout(clear, 180);
  });
  doc.addEventListener('focusin', event => {
    const button = event.target.closest?.('[data-ap-reference]');
    if (button) show(button);
    else if (panel?.tagName !== 'DIALOG') clear();
  });
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('[data-ap-reference]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); show(button, true);
  }, true);
  doc.addEventListener('keydown', event => { if (event.key === 'Escape' && panel?.tagName !== 'DIALOG') clear(); });
  doc.addEventListener('scroll', event => { if (panel?.tagName !== 'DIALOG' && !panel?.contains(event.target)) clear(); }, true);
  new MutationObserver(() => {
    if (trigger && (!trigger.isConnected || trigger.closest('.view')?.classList.contains('active') === false)) clear();
  }).observe(doc.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  return { clear };
}
