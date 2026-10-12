export function preserveViewScroll(content, update) {
  // Snapshot every scrollable ancestor, not just .view: below the 1040px
  // breakpoint .view is overflow:visible and the document itself is the
  // scroller, so preserving only .view.scrollTop loses the position.
  // Also covers nested scrollers within the content subtree.
  const owners = [];
  const seen = new Set();
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const consider = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      let overflowY = "";
      try { overflowY = window.getComputedStyle(el).overflowY; } catch { return; }
      const isDocScroller = el === document.scrollingElement || el === document.documentElement;
      if ((/(auto|scroll|overlay)/.test(overflowY) || isDocScroller) && el.scrollHeight > el.clientHeight + 1) {
        owners.push(el);
      }
    };
    for (let current = content; current; current = current.parentElement) consider(current);
    consider(document.scrollingElement);
    consider(document.documentElement);
    const scope = content?.parentElement || document.body;
    if (scope?.querySelectorAll) {
      for (const el of scope.querySelectorAll("*")) consider(el);
    }
  }
  // A route can retain scroll even when style APIs are unavailable (for
  // example while detached). Preserve that known owner as well.
  const route = content?.closest?.(".view");
  if (route && !owners.includes(route)) owners.push(route);
  const snapshot = owners.map((owner) => ({ owner, top: owner.scrollTop, left: owner.scrollLeft }));
  // Blur focused controls inside the content before DOM replacement: a
  // focused checkbox removed mid-focus can reset scroll as focus falls back.
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (active && active !== document.body && content?.contains(active)) {
      try { active.blur(); } catch { /* ignore */ }
    }
  }
  update();
  const restore = () => {
    for (const { owner, top, left } of snapshot) {
      if (owner.isConnected === false) continue;
      try {
        owner.scrollTop = top;
        owner.scrollLeft = left;
      } catch { /* ignore */ }
    }
  };
  restore();
  if (typeof window !== "undefined") {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(restore);
    setTimeout(restore, 0);
    setTimeout(restore, 60);
  }
}

export function replaceViewContent(content, markup, { text = false } = {}) {
  if (!content) return;
  preserveViewScroll(content, () => {
    if (text) content.textContent = markup;
    else content.innerHTML = markup;
  });
}

// Chat messages pane: where a freshly rendered pane should scroll.
// Follows the bottom when the reader was pinned there (or the pane is new),
// so new messages still arrive in view; otherwise keeps the reader's
// position, clamped to the new content height. `previous` is the pre-render
// pane element, which stays readable after the DOM swap detaches it.
export function chatPaneScrollTop(pane, previous) {
  const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
  if (!previous) return max;
  const wasPinned =
    previous.scrollHeight - previous.scrollTop - previous.clientHeight <= 64;
  if (wasPinned) return max;
  return Math.min(previous.scrollTop, max);
}

// Compatibility exports for code that snapshots and restores separately
// (e.g. src/ui/daily/source-controller.js). Snapshots by SELECTOR, not
// element reference, because the DOM is replaced between capture and restore.
// Holding old element references would restore to disconnected nodes.
export function relativeSelector(root, element) {
  if (element === root) return ":scope";
  const parts = [];
  for (let node = element; node && node !== root; node = node.parentElement) {
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const tag = node.tagName.toLowerCase();
    const hook = ["data-note-scope", "data-structured-primary-note-scope"].find(key => node.getAttribute?.(key));
    let part = hook ? `${tag}[${hook}="${CSS.escape(node.getAttribute(hook))}"]` : tag;
    if (!hook && node.parentElement) {
      const siblings = [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(" > ");
}

export function captureScrollPositions(root) {
  if (!root) return [];
  const snapshot = [];
  const doc = typeof document === "undefined" ? null : document;
  const seen = new Set();
  const consider = (el, selector) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    if (el.scrollTop || el.scrollLeft) snapshot.push({ selector, top: el.scrollTop, left: el.scrollLeft });
  };
  consider(root, ":scope");
  for (const el of root.querySelectorAll?.("*") || []) consider(el, relativeSelector(root, el));
  for (let el = root.parentElement; el; el = el.parentElement) {
    if (el === doc?.scrollingElement || el === doc?.documentElement) consider(el, ":root-scroller");
    else if (el.id) consider(el, `#${CSS.escape(el.id)}`);
  }
  consider(doc?.scrollingElement || doc?.documentElement, ":root-scroller");
  return snapshot;
}

export function restoreScrollPositions(root, snapshot) {
  if (!snapshot || !snapshot.length) return;
  const apply = () => {
    for (const { selector, top, left } of snapshot) {
      let el = null;
      try {
        if (selector === ":scope") {
          el = root;
        } else if (selector === ":root-scroller") {
          el = document.scrollingElement || document.documentElement;
        } else if (selector.startsWith("#")) {
          el = document.getElementById(selector.slice(1));
        } else {
          // Try to find in the new root first, then document.
          el = root?.querySelector?.(selector) || document.querySelector(selector);
        }
      } catch { continue; }
      if (!el) continue;
      try {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = top;
        if (el.scrollWidth > el.clientWidth) el.scrollLeft = left;
      } catch { /* ignore */ }
    }
  };
  apply();
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(apply);
  }
}
