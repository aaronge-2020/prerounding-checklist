// Scroll preservation across DOM re-renders.
//
// Several views re-render a subtree via outerHTML/innerHTML on every button
// click (e.g. the enter-by-section primary-note editor). Any *inner* scroller
// inside the replaced subtree — like the section-nav list — loses its
// scrollTop, and restoring only the outer `.view` scrollTop leaves the inner
// list yanked to the top. So every helper here snapshots *all* scrolled
// descendants of the touched root, keyed by a relative selector that stays
// stable across identical re-renders, and re-applies them after.

const STABLE_ATTRS = [
  "data-structured-primary-note-scope",
  "data-structured-note-scope",
  "data-structured-note-field",
  "data-note-scope",
  "data-note-field",
  "data-action",
  "data-view-target",
];

function escapeAttrValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function describeNode(node) {
  const tag = node.tagName.toLowerCase();
  if (node.id) return `#${CSS.escape(node.id)}`;
  for (const attr of STABLE_ATTRS) {
    const val = node.getAttribute?.(attr);
    if (val) return `${tag}[${attr}="${escapeAttrValue(val)}"]`;
  }
  return tag;
}

// Selector for `el` relative to `root`, stable across re-renders of the same
// template. Prefers ids and data hooks; falls back to nth-of-type.
export function relativeSelector(root, el) {
  if (el === root) return ":scope";
  const parts = [];
  let node = el;
  while (node && node !== root && node !== document.documentElement) {
    const parent = node.parentElement;
    let part = describeNode(node);
    if (parent && !part.includes("[") && !part.startsWith("#")) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === node.tagName
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

function queryWithin(root, selector) {
  try {
    return selector === ":scope" ? root : root.querySelector(selector);
  } catch {
    return null;
  }
}

// Snapshot every actually-scrolled descendant of root (plus root itself).
// In non-DOM environments (unit tests with mock nodes) there is no document;
// fall back to preserving the root's own offsets so the contract still holds.
export function captureScrollPositions(root) {
  const out = [];
  if (!root) return out;
  if (typeof document === "undefined" || typeof root.querySelectorAll !== "function") {
    if ((root.scrollTop || 0) > 0 || (root.scrollLeft || 0) > 0) {
      out.push({ selector: ":scope", top: root.scrollTop || 0, left: root.scrollLeft || 0 });
    }
    return out;
  }
  const candidates = [root, ...root.querySelectorAll("*")];
  for (const el of candidates) {
    const top = el.scrollTop || 0;
    const left = el.scrollLeft || 0;
    if (top > 0 || left > 0) {
      if (
        el.scrollHeight > el.clientHeight + 4 ||
        el.scrollWidth > el.clientWidth + 4
      ) {
        out.push({ selector: relativeSelector(root, el), top, left });
      }
    }
  }
  return out;
}

// Re-apply a snapshot inside `root` (usually the freshly re-rendered root).
// Re-asserts on the next frame in case layout hadn't settled and the
// synchronous set got clamped.
export function restoreScrollPositions(root, snapshot) {
  if (!root || !snapshot || !snapshot.length) return;
  const apply = (reassertOnly) => {
    for (const { selector, top, left } of snapshot) {
      const target = queryWithin(root, selector);
      if (!target) continue;
      if (!reassertOnly) {
        target.scrollTop = top;
        target.scrollLeft = left;
      } else {
        if (Math.abs(target.scrollTop - top) > 2) target.scrollTop = top;
        if (Math.abs(target.scrollLeft - left) > 2) target.scrollLeft = left;
      }
    }
  };
  apply(false);
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => apply(true));
  }
}

export function preserveViewScroll(content, update) {
  const view = content?.closest?.(".view");
  const snapshot = captureScrollPositions(view || content);
  update();
  // Re-resolve the root: update() may have replaced nodes. In a real DOM,
  // walk from content while it is still connected; in non-DOM harnesses
  // fall back to the captured view/content objects.
  let root = null;
  if (typeof document !== "undefined" && typeof document.querySelector === "function") {
    root = content?.isConnected
      ? content.closest(".view")
      : document.querySelector(".view.active");
  }
  restoreScrollPositions(root || view || content, snapshot);
}

export function replaceViewContent(content, markup, { text = false } = {}) {
  if (!content) return;
  preserveViewScroll(content, () => {
    if (text) content.textContent = markup;
    else content.innerHTML = markup;
  });
}
