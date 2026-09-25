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
      if (!owner.isConnected && owner !== document.scrollingElement && owner !== document.documentElement) continue;
      try {
        if (owner.scrollHeight > owner.clientHeight) owner.scrollTop = top;
        if (owner.scrollWidth > owner.clientWidth) owner.scrollLeft = left;
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

// Compatibility exports for code that snapshots and restores separately
// (e.g. src/ui/daily/source-controller.js). Snapshots by SELECTOR, not
// element reference, because the DOM is replaced between capture and restore.
// Holding old element references would restore to disconnected nodes.
export function captureScrollPositions(root) {
  const snapshot = [];
  const seen = new Set();
  if (typeof window === "undefined" || typeof document === "undefined" || !root) return snapshot;

  const selectorFor = (el) => {
    if (el === document.scrollingElement || el === document.documentElement) return ":root-scroller";
    if (el.id) return `#${CSS.escape(el.id)}`;
    // Use a path-based selector for elements without IDs.
    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== root.parentElement) {
      const tag = current.tagName?.toLowerCase() || "unknown";
      const classes = current.className && typeof current.className === "string"
        ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => `.${CSS.escape(c)}`).join("")
        : "";
      parts.unshift(`${tag}${classes}`);
      current = current.parentElement;
      if (parts.length > 4) break; // Limit depth
    }
    return parts.join(" > ");
  };

  const consider = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    let overflowY = "";
    try { overflowY = window.getComputedStyle(el).overflowY; } catch { return; }
    const isDocScroller = el === document.scrollingElement || el === document.documentElement;
    if ((/(auto|scroll|overlay)/.test(overflowY) || isDocScroller) && el.scrollHeight > el.clientHeight + 1) {
      snapshot.push({ selector: selectorFor(el), top: el.scrollTop, left: el.scrollLeft });
    }
  };
  for (let current = root; current; current = current.parentElement) consider(current);
  consider(document.scrollingElement);
  consider(document.documentElement);
  const scope = root?.parentElement || document.body;
  if (scope?.querySelectorAll) {
    for (const el of scope.querySelectorAll("*")) consider(el);
  }
  return snapshot;
}

export function restoreScrollPositions(root, snapshot) {
  if (!snapshot || !snapshot.length) return;
  const apply = () => {
    for (const { selector, top, left } of snapshot) {
      let el = null;
      try {
        if (selector === ":root-scroller") {
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
