// Scroll preservation for whole-view re-renders and surgical subtree swaps.
// Pure DOM-edge helpers: safe to import in Node (they degrade gracefully when
// window/document are unavailable) and covered by tests/test-view-scroll.js.

const cssEscape =
  typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function"
    ? (value) => CSS.escape(String(value ?? ""))
    : (value) => String(value ?? "").replace(/["\\]/g, "\\$&");

// First stable data-* hook on an element, for selectors that survive
// re-renders (ids and classes can shift; data hooks are author-controlled).
function stableDataHook(el) {
  let names = [];
  if (typeof el.getAttributeNames === "function") {
    try {
      names = el.getAttributeNames();
    } catch {
      names = [];
    }
  } else if (el.attrs && typeof el.attrs === "object") {
    names = Object.keys(el.attrs);
  }
  const hook = names.filter((name) => name.startsWith("data-")).sort()[0];
  if (!hook || typeof el.getAttribute !== "function") return null;
  const value = el.getAttribute(hook);
  if (value == null) return null;
  return { name: hook, value: String(value) };
}

function nodeSelector(el) {
  const tag = el.tagName?.toLowerCase() || "unknown";
  if (el.id) return `#${cssEscape(el.id)}`;
  const hook = stableDataHook(el);
  if (hook) return `${tag}[${hook.name}="${cssEscape(hook.value)}"]`;
  return tag;
}

// Selector for `el` relative to `root`, preferring stable data hooks over
// positional/class paths so it still resolves after a re-render builds a
// fresh subtree. `root` itself is ":scope".
export function relativeSelector(root, el) {
  if (el === root) return ":scope";
  if (!el) return "";
  const parts = [];
  let current = el;
  while (current && current !== root) {
    parts.unshift(nodeSelector(current));
    current = current.parentElement;
    if (parts.length > 4) break; // Limit depth
  }
  return parts.join(" > ");
}

export function preserveViewScroll(content, update) {
  // Snapshot every scrollable ancestor, not just .view: below the 1040px
  // breakpoint .view is overflow:visible and the document itself is the
  // scroller, so preserving only .view.scrollTop loses the position.
  // Also covers nested scrollers within the content subtree.
  const owners = [];
  const seen = new Set();
  const doc = typeof document !== "undefined" ? document : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  const consider = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    let overflowY = "";
    try {
      overflowY = win ? win.getComputedStyle(el).overflowY : "";
    } catch {
      return;
    }
    const styleScrollable = !win || /(auto|scroll|overlay)/.test(overflowY);
    const isDocScroller = !!doc && (el === doc.scrollingElement || el === doc.documentElement);
    const hasMetrics =
      typeof el.scrollHeight === "number" && typeof el.clientHeight === "number";
    // Without style inspection (non-DOM environments), trust explicit scroll
    // offsets: an element exposing scrollTop/scrollLeft is treated as the
    // scroll owner under test.
    const metricScrollable = hasMetrics
      ? el.scrollHeight > el.clientHeight + 1
      : typeof el.scrollTop === "number" && typeof el.scrollLeft === "number";
    if ((styleScrollable || isDocScroller) && metricScrollable) owners.push(el);
  };
  if (win && doc) {
    for (let current = content; current; current = current.parentElement) consider(current);
    consider(doc.scrollingElement);
    consider(doc.documentElement);
    const scope = content?.parentElement || doc.body;
    if (scope?.querySelectorAll) {
      for (const el of scope.querySelectorAll("*")) consider(el);
    }
  }
  // The route scroll owner is reachable via the .view ancestor even when
  // style inspection is unavailable (or misses it).
  try {
    consider(content?.closest?.(".view"));
  } catch {
    /* ignore */
  }
  const snapshot = owners.map((owner) => ({ owner, top: owner.scrollTop, left: owner.scrollLeft }));
  // Blur focused controls inside the content before DOM replacement: a
  // focused checkbox removed mid-focus can reset scroll as focus falls back.
  if (doc) {
    const active = doc.activeElement;
    if (active && active !== doc.body && content?.contains?.(active)) {
      try {
        active.blur();
      } catch {
        /* ignore */
      }
    }
  }
  update();
  const restore = () => {
    for (const { owner, top, left } of snapshot) {
      if (
        doc &&
        owner.isConnected === false &&
        owner !== doc.scrollingElement &&
        owner !== doc.documentElement
      )
        continue;
      try {
        // Without scroll metrics we cannot tell a scroller from a plain
        // node; the snapshot was taken because it exposed scroll offsets,
        // so restore them rather than silently dropping the position.
        const canScrollV =
          typeof owner.scrollHeight !== "number" ||
          typeof owner.clientHeight !== "number" ||
          owner.scrollHeight > owner.clientHeight;
        const canScrollH =
          typeof owner.scrollWidth !== "number" ||
          typeof owner.clientWidth !== "number" ||
          owner.scrollWidth > owner.clientWidth;
        if (canScrollV) owner.scrollTop = top;
        if (canScrollH) owner.scrollLeft = left;
      } catch {
        /* ignore */
      }
    }
  };
  restore();
  if (win) {
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(restore);
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
  const doc = typeof document !== "undefined" ? document : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  if (!doc || !root) return snapshot;

  const consider = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    let overflowY = "";
    try {
      overflowY = win ? win.getComputedStyle(el).overflowY : "";
    } catch {
      return;
    }
    const styleScrollable = !win || /(auto|scroll|overlay)/.test(overflowY);
    const isDocScroller = el === doc.scrollingElement || el === doc.documentElement;
    const hasMetrics =
      typeof el.scrollHeight === "number" && typeof el.clientHeight === "number";
    const metricScrollable = hasMetrics
      ? el.scrollHeight > el.clientHeight + 1
      : typeof el.scrollTop === "number" && typeof el.scrollLeft === "number";
    if ((styleScrollable || isDocScroller) && metricScrollable) {
      snapshot.push({
        selector: isDocScroller ? ":root-scroller" : relativeSelector(root, el),
        top: el.scrollTop,
        left: el.scrollLeft
      });
    }
  };
  for (let current = root; current; current = current.parentElement) consider(current);
  consider(doc.scrollingElement);
  consider(doc.documentElement);
  // Scan the replaced subtree itself (its own scrollers, e.g. the section
  // nav list) as well as the surrounding scope. The root scan covers
  // detached trees where root.parentElement/document.body are unavailable.
  const scope = root?.parentElement || doc.body;
  for (const scopeEl of [root, scope]) {
    if (scopeEl?.querySelectorAll) {
      for (const el of scopeEl.querySelectorAll("*")) consider(el);
    }
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
      } catch {
        continue;
      }
      if (!el) continue;
      try {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = top;
        if (el.scrollWidth > el.clientWidth) el.scrollLeft = left;
      } catch {
        /* ignore */
      }
    }
  };
  apply();
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(apply);
  }
}
